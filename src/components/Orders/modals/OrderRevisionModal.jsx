'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, IndianRupee, AlertCircle, Save, Package } from 'lucide-react';
import SearchableProductSelect from '@/components/common/SearchableProductSelect';
import { getTenantProducts } from '@/app/actions/tenantProducts';
import { PRODUCT_GROUPS } from '@/config/productCatalog';
import { reviseOrderItems } from '@/app/actions/orderFulfillment';

export default function OrderRevisionModal({
  order,
  isOpen,
  onClose,
  onSuccess,
  userName = 'Sales Desk',
  tenantId = 'TNT00002'
}) {
  const [items, setItems] = useState([]);
  const [revisionReason, setRevisionReason] = useState('');
  const [availableProducts, setAvailableProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Initialize line items from current order
  useEffect(() => {
    if (!order) return;
    const rawItems = Array.isArray(order.order_line_items) ? order.order_line_items : [];
    if (rawItems.length > 0) {
      setItems(rawItems.map(it => ({
        product: it.product || it.name || '',
        qty: Number(it.qty) || 1,
        rate: Number(it.rate) || (order.total_amount && order.total_ordered_qty ? Math.round(order.total_amount / order.total_ordered_qty) : 0)
      })));
    } else {
      setItems([{
        product: 'Standard Product',
        qty: Number(order.total_ordered_qty) || 1,
        rate: Number(order.total_amount) || 0
      }]);
    }
    setRevisionReason('');
    setErrorMsg('');
  }, [order]);

  // Load tenant catalog products
  useEffect(() => {
    if (!isOpen) return;
    async function loadCatalog() {
      setLoading(true);
      try {
        const res = await getTenantProducts(tenantId || 'TNT00002', 'ALL');
        const list = Array.isArray(res) ? res : (Array.isArray(res?.products) ? res.products : []);
        setAvailableProducts(list.length > 0 ? list : PRODUCT_GROUPS);
      } catch (_) {
        setAvailableProducts(PRODUCT_GROUPS);
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, [isOpen, tenantId]);

  if (!isOpen || !order) return null;

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const handleProductSelect = (index, selectedProduct) => {
    const updated = [...items];
    const prodName = typeof selectedProduct === 'string'
      ? selectedProduct
      : (selectedProduct?.name || selectedProduct?.id || '');

    // Resolve rate from selectedProduct object or availableProducts catalog lookup
    let prodPrice = null;
    if (typeof selectedProduct === 'object' && selectedProduct?.price != null && selectedProduct?.price !== '') {
      prodPrice = selectedProduct.price;
    } else {
      const match = availableProducts.find(p =>
        p.name === prodName ||
        p.id === prodName ||
        (p.sku && p.sku === prodName)
      );
      if (match && match.price != null && match.price !== '') {
        prodPrice = match.price;
      }
    }

    updated[index].product = prodName;
    if (prodPrice != null && prodPrice !== '') {
      updated[index].rate = Number(prodPrice) || 0;
    }
    setItems(updated);
  };

  const handleAddItem = () => {
    setItems(prev => [...prev, { product: '', qty: 1, rate: 0 }]);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) {
      alert('Order must contain at least 1 item.');
      return;
    }
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Grand Total calculation
  const totalUnits = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const totalAmount = items.reduce((sum, it) => sum + ((Number(it.qty) || 0) * (Number(it.rate) || 0)), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.some(it => !it.product || !it.product.trim())) {
      setErrorMsg('Please select a valid product name for all line items.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    try {
      const res = await reviseOrderItems(order.id, items, userName, revisionReason, tenantId);
      if (res.success) {
        if (onSuccess) onSuccess(res.order);
        onClose();
      } else {
        setErrorMsg(res.error || 'Failed to modify order items.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '14px',
        width: '96%',
        maxWidth: '1200px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                fontSize: '0.74rem',
                fontWeight: 800,
                padding: '0.2rem 0.5rem',
                borderRadius: '6px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#0284c7'
              }}>
                STAGE S01
              </span>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Modify Order Items — {order.order_number}
              </h3>
            </div>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Channel Partner: <strong style={{ color: 'var(--text-primary)' }}>{order.party?.firm_name || 'Channel Partner'}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {errorMsg && (
              <div style={{
                padding: '0.65rem 0.85rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                borderRadius: '8px',
                color: '#ef4444',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <AlertCircle size={15} />
                {errorMsg}
              </div>
            )}

            {/* Line Items List */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                <label style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Ordered Products &amp; Quantities:
                </label>
                <button
                  type="button"
                  onClick={handleAddItem}
                  style={{
                    padding: '0.35rem 0.65rem',
                    background: 'rgba(37, 99, 235, 0.1)',
                    border: '1px solid #2563eb',
                    borderRadius: '6px',
                    color: '#2563eb',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                >
                  <Plus size={13} />
                  Add Product
                </button>
              </div>

              {/* Column Titles Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 95px 135px 135px 38px',
                  gap: '0.65rem',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}
              >
                <div>Product</div>
                <div style={{ textAlign: 'center' }}>Qty</div>
                <div style={{ textAlign: 'right' }}>Rate (₹)</div>
                <div style={{ textAlign: 'right' }}>Total (₹)</div>
                <div></div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 95px 135px 135px 38px',
                      gap: '0.65rem',
                      alignItems: 'center',
                      background: 'var(--bg-primary)',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)'
                    }}
                  >
                    {/* Searchable Product Select */}
                    <div>
                      <SearchableProductSelect
                        products={availableProducts}
                        value={item.product}
                        onChange={(selected) => handleProductSelect(idx, selected)}
                        placeholder="Search product..."
                      />
                    </div>

                    {/* Qty */}
                    <div>
                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={e => handleItemChange(idx, 'qty', Math.max(1, Number(e.target.value) || 1))}
                        placeholder="Qty"
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          fontSize: '0.82rem',
                          textAlign: 'center'
                        }}
                      />
                    </div>

                    {/* Rate */}
                    <div>
                      <input
                        type="number"
                        min="0"
                        value={item.rate}
                        onChange={e => handleItemChange(idx, 'rate', Math.max(0, Number(e.target.value) || 0))}
                        placeholder="Rate ₹"
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          fontSize: '0.82rem',
                          textAlign: 'right'
                        }}
                      />
                    </div>

                    {/* Line Amount */}
                    <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.84rem' }}>
                      ₹{((Number(item.qty) || 0) * (Number(item.rate) || 0)).toLocaleString('en-IN')}
                    </div>

                    {/* Delete Item */}
                    <div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '0.25rem',
                          display: 'flex'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals Summary Card */}
            <div style={{
              background: 'var(--bg-primary)',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              border: '1px solid var(--border-light)'
            }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Total Revised Units:
                </span>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {totalUnits} Unit(s)
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Total Revised Amount:
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981' }}>
                  ₹{totalAmount.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Revision Reason / Notes */}
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Modification Note / Reason
              </label>
              <textarea
                value={revisionReason}
                onChange={e => setRevisionReason(e.target.value)}
                rows={2}
                placeholder="e.g. Dealer updated order quantity after phone confirmation."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  marginTop: '0.25rem'
                }}
              />
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-light)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            background: 'var(--bg-surface)'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                fontSize: '0.84rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '0.5rem 1.25rem',
                background: '#2563eb',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '0.84rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              <Save size={15} />
              {saving ? 'Saving Changes...' : 'Save & Update Items'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
