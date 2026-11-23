'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, Truck, Search, Plus, Trash2, Loader2, Sparkles, AlertCircle, Package } from 'lucide-react';
import { getPartyList } from '@/app/actions/partyMaster';
import { saveOrderFollowupAndRecur } from '@/app/actions/orderFulfillment';
import SearchableProductSelect from '@/components/common/SearchableProductSelect';
import { getTenantProducts } from '@/app/actions/tenantProducts';
import { PRODUCT_GROUPS } from '@/config/productCatalog';

export default function InstantOrderModal({
  isOpen,
  onClose,
  tenantId = '',
  userId = '',
  userName = 'Employee',
  userCompany = ''
}) {
  const [parties, setParties] = useState([]);
  const [loadingParties, setLoadingParties] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  const [selectedParty, setSelectedParty] = useState(null);

  // Available catalog products
  const [availableProducts, setAvailableProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Line items state
  const [items, setItems] = useState([
    { product: '', qty: 1, unit_price: '' }
  ]);
  const [billingRoute, setBillingRoute] = useState('DIRECT_COMPANY_BILLING');
  const [preferredDispatchDate, setPreferredDispatchDate] = useState(() => {
    try {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    } catch (_e) {
      return '';
    }
  });
  const [orderNotes, setOrderNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Fetch party list and products on modal open
  useEffect(() => {
    if (!isOpen) {
      setSelectedParty(null);
      setPartySearch('');
      setErrorMsg('');
      setSuccessMsg('');
      setItems([{ product: '', qty: 1, unit_price: '' }]);
      return;
    }

    let active = true;

    // Load parties
    async function loadParties() {
      setLoadingParties(true);
      try {
        const res = await getPartyList(tenantId, { limit: 200 });
        if (active && Array.isArray(res)) {
          setParties(res);
        } else if (active && res?.data && Array.isArray(res.data)) {
          setParties(res.data);
        }
      } catch (e) {
        console.warn('Failed to load parties for quick order:', e);
      } finally {
        if (active) setLoadingParties(false);
      }
    }

    // Load products
    async function loadProducts() {
      setLoadingProducts(true);
      try {
        const res = await getTenantProducts(tenantId || userCompany || 'Default', 'ALL');
        const list = Array.isArray(res) ? res : (Array.isArray(res?.products) ? res.products : []);
        if (active) {
          setAvailableProducts(list.length > 0 ? list : PRODUCT_GROUPS);
        }
      } catch (_e) {
        if (active) setAvailableProducts(PRODUCT_GROUPS);
      } finally {
        if (active) setLoadingProducts(false);
      }
    }

    loadParties();
    loadProducts();
    return () => { active = false; };
  }, [isOpen, tenantId, userCompany]);

  const filteredParties = useMemo(() => {
    if (!partySearch.trim()) return parties.slice(0, 30);
    const q = partySearch.toLowerCase().trim();
    return parties.filter(p => 
      (p.firm_name || '').toLowerCase().includes(q) ||
      (p.party_universal_code || '').toLowerCase().includes(q) ||
      (p.primary_mobile || '').includes(q) ||
      (p.city || '').toLowerCase().includes(q)
    ).slice(0, 30);
  }, [parties, partySearch]);

  const totalQty = useMemo(() => {
    return items.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0);
  }, [items]);

  const totalAmount = useMemo(() => {
    return items.reduce((acc, curr) => {
      const q = Number(curr.qty) || 0;
      const p = Number(curr.unit_price) || 0;
      return acc + (q * p);
    }, 0);
  }, [items]);

  const handleAddItem = () => {
    setItems(prev => [...prev, { product: '', qty: 1, unit_price: '' }]);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    setItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedParty) {
      setErrorMsg('Please select a customer / channel partner.');
      return;
    }

    const validItems = items.filter(i => (i.product || '').trim().length > 0 && Number(i.qty) > 0);
    if (validItems.length === 0) {
      setErrorMsg('Please select at least one product and quantity.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await saveOrderFollowupAndRecur({
        party_id: selectedParty.id,
        call_status: 'ORDER_PLACED',
        assigned_caller_name: userName || 'Employee',
        assigned_caller_id: userId || null,
        product: validItems[0]?.product || 'Standard Product',
        qty: totalQty,
        total_amount: totalAmount,
        order_line_items: validItems,
        billing_route: billingRoute,
        preferred_dispatch_date: preferredDispatchDate || null,
        notes: orderNotes.trim() ? `[Instant Home Order] ${orderNotes.trim()}` : '[Instant Home Order]'
      }, tenantId);

      if (res?.success) {
        setSuccessMsg(`✓ Order punched successfully! Generated Order #${res.generated_order_no || 'CONFIRMED'}.`);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setErrorMsg('Failed to place order: ' + (res?.error || 'Unknown error occurred'));
      }
    } catch (err) {
      setErrorMsg('Error placing order: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface, #ffffff)',
        color: 'var(--text-primary, #0f172a)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '720px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
        border: '1px solid var(--border-light, #e2e8f0)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(59, 130, 246, 0.05) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Truck size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Instant Order Entry
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', margin: '2px 0 0 0' }}>
                Punch a new sales order directly into the delivery pipeline (S01)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #64748b)',
              cursor: 'pointer',
              padding: '0.35rem',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              color: '#16a34a',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Check size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* 1. Party / Customer Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.4rem' }}>
              Select Channel Partner / Customer <span style={{ color: '#ef4444' }}>*</span>
            </label>
            {selectedParty ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0.85rem',
                backgroundColor: 'rgba(37, 99, 235, 0.06)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                borderRadius: '8px'
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1d4ed8' }}>
                    {selectedParty.firm_name}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                    {selectedParty.party_universal_code || 'No Code'} • {selectedParty.primary_mobile || 'No Mobile'} • {selectedParty.city || 'No City'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedParty(null)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border-light, #e2e8f0)',
                    padding: '0.3rem 0.6rem',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    color: 'var(--text-secondary, #64748b)'
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={partySearch}
                    onChange={(e) => setPartySearch(e.target.value)}
                    placeholder="Search by firm name, party code, mobile, city..."
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem 0.6rem 2.25rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light, #e2e8f0)',
                      fontSize: '0.88rem',
                      outline: 'none',
                      backgroundColor: 'var(--bg-card, #ffffff)'
                    }}
                  />
                </div>
                <div style={{
                  maxHeight: '140px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  borderRadius: '8px',
                  marginTop: '0.35rem',
                  backgroundColor: 'var(--bg-card, #ffffff)'
                }}>
                  {loadingParties ? (
                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.82rem', color: '#64748b' }}>
                      <Loader2 size={16} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} />
                      Loading parties...
                    </div>
                  ) : filteredParties.length === 0 ? (
                    <div style={{ padding: '0.85rem', textAlign: 'center', fontSize: '0.82rem', color: '#94a3b8' }}>
                      No parties found.
                    </div>
                  ) : (
                    filteredParties.map(p => (
                      <div
                        key={p.id}
                        onClick={() => setSelectedParty(p)}
                        style={{
                          padding: '0.5rem 0.75rem',
                          borderBottom: '1px solid var(--border-light, #f1f5f9)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.84rem'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <span style={{ fontWeight: 600 }}>{p.firm_name}</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {p.party_universal_code} • {p.city || '-'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Order Line Items with Searchable Product Select */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                Products &amp; Quantities <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(37, 99, 235, 0.08)',
                  color: '#2563eb',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 650,
                  cursor: 'pointer'
                }}
              >
                <Plus size={13} />
                <span>Add Item</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ flex: 3, minWidth: '180px' }}>
                    <SearchableProductSelect
                      products={availableProducts}
                      value={item.product}
                      onChange={(selectedVal) => {
                        const prodName = typeof selectedVal === 'object' ? (selectedVal.name || '') : selectedVal;
                        const match = availableProducts.find(p => (p.name || '').toLowerCase() === (prodName || '').toLowerCase() || p.id === prodName);
                        handleItemChange(idx, 'product', prodName);
                        if (match && match.price != null && !item.unit_price) {
                          handleItemChange(idx, 'unit_price', match.price);
                        }
                      }}
                      placeholder="Select product from catalog..."
                      required
                    />
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                    placeholder="Qty"
                    required
                    style={{
                      flex: 1,
                      minWidth: '65px',
                      padding: '0.55rem 0.6rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light, #e2e8f0)',
                      fontSize: '0.85rem'
                    }}
                  />
                  <input
                    type="number"
                    min="0"
                    value={item.unit_price}
                    onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                    placeholder="Rate ₹"
                    style={{
                      flex: 1.2,
                      minWidth: '80px',
                      padding: '0.55rem 0.6rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light, #e2e8f0)',
                      fontSize: '0.85rem'
                    }}
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '0.55rem 0.35rem'
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem', fontSize: '0.82rem', fontWeight: 650, color: '#475569' }}>
              <span>Total Qty: <strong>{totalQty}</strong></span>
              {totalAmount > 0 && <span>Total Amount: <strong>₹{totalAmount.toLocaleString('en-IN')}</strong></span>}
            </div>
          </div>

          {/* 3. Dispatch & Billing Settings */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Billing Route
              </label>
              <select
                value={billingRoute}
                onChange={(e) => setBillingRoute(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  fontSize: '0.85rem',
                  backgroundColor: 'var(--bg-card, #ffffff)'
                }}
              >
                <option value="DIRECT_COMPANY_BILLING">Direct Company Billing</option>
                <option value="DISTRIBUTOR_BILLING">Distributor Billing</option>
                <option value="DEALER_SUB_DEALER">Dealer / Sub-dealer</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Preferred Dispatch Date
              </label>
              <input
                type="date"
                value={preferredDispatchDate}
                onChange={(e) => setPreferredDispatchDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>

          {/* 4. Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Order Notes / Instructions (Optional)
            </label>
            <textarea
              rows={2}
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="e.g. Urgent dispatch requested, specific transporter, etc."
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light, #e2e8f0)',
                fontSize: '0.85rem',
                resize: 'none'
              }}
            />
          </div>

          {/* Modal Actions */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--border-light, #e2e8f0)'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light, #e2e8f0)',
                background: 'none',
                color: 'var(--text-secondary, #64748b)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedParty}
              style={{
                padding: '0.55rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                background: selectedParty
                  ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                  : '#cbd5e1',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: selectedParty && !submitting ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                boxShadow: selectedParty ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none'
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Punching Order...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Punch Order Instantly</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
