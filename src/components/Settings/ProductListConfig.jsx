'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Package, Plus, Search, Filter, Download, Upload, Edit3, Trash2,
  CheckCircle2, AlertCircle, X, RefreshCw, Building2, Layers,
  IndianRupee, Tag, BarChart3, ArrowUpDown, Check, FileSpreadsheet
} from 'lucide-react';
import { getTenantBranches } from '@/app/actions/tenantBranches';
import {
  getTenantProducts,
  saveTenantProduct,
  deleteTenantProduct,
  toggleTenantProductStatus,
  importTenantProducts
} from '@/app/actions/tenantProducts';

const DEFAULT_CATEGORIES = [
  'Implement',
  'Rotavator',
  'Plough',
  'Land Leveller',
  'Disc Harrow',
  'Cultivator',
  'Seeder',
  'Planter',
  'Harvesting',
  'Mulcher',
  'Spare Part',
  'Raw Material',
  'Machinery',
  'Finished Goods',
  'General'
];

const UOM_OPTIONS = ['Units', 'Pcs', 'Kg', 'Ton', 'Box', 'Set', 'Nos', 'Mtr', 'Ltr'];
const TAX_SLABS = [0, 5, 12, 18, 28];

const INITIAL_COL_WIDTHS = {
  status: 90,
  name: 240,
  sku: 140,
  branch: 170,
  category: 140,
  price: 130,
  tax: 90,
  hsn: 110,
  stock: 100,
  uom: 90,
  updated: 140,
  actions: 110
};

export default function ProductListConfig({ userCompany = '' }) {
  const effectiveCompany = userCompany || 'Swan Hosting';
  const storageKey = `crm_products_col_widths_${effectiveCompany.replace(/\s+/g, '_').toLowerCase()}`;

  // Data state
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | ACTIVE | INACTIVE

  // Modals
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [formError, setFormError] = useState(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importBranch, setImportBranch] = useState('All Branches');
  const [importResult, setImportResult] = useState(null);

  // Delete confirm
  const [deletingProductId, setDeletingProductId] = useState(null);

  // Column Resizing state
  const [colWidths, setColWidths] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) return { ...INITIAL_COL_WIDTHS, ...JSON.parse(saved) };
      } catch (_) {}
    }
    return INITIAL_COL_WIDTHS;
  });

  const resizingColRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const [activeResizingCol, setActiveResizingCol] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: 'Implement',
    branchName: 'All Branches',
    uom: 'Units',
    price: '',
    taxRate: 12,
    hsnCode: '8432',
    stockQuantity: '',
    minOrderQty: 1,
    description: '',
    isActive: true
  });

  // Show Toast
  const showToast = useCallback((msg, type = 'success') => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Fetch branches and products
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [brRes, prRes] = await Promise.all([
        getTenantBranches(effectiveCompany),
        getTenantProducts(effectiveCompany, 'ALL')
      ]);

      if (brRes?.success && Array.isArray(brRes.branches)) {
        setBranches(brRes.branches);
      }
      if (prRes?.success && Array.isArray(prRes.products)) {
        setProducts(prRes.products);
      }
    } catch (err) {
      console.error('Error loading product data:', err);
      showToast('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }, [effectiveCompany, showToast]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const prRes = await getTenantProducts(effectiveCompany, 'ALL');
      if (prRes?.success && Array.isArray(prRes.products)) {
        setProducts(prRes.products);
        showToast('Products refreshed successfully!');
      }
    } catch (_) {
      showToast('Refresh failed', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  // --- Resizing Handlers (Lead Data Pattern) ---
  const handleMouseDownResize = (e, colId) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColRef.current = colId;
    startXRef.current = e.clientX;
    startWidthRef.current = colWidths[colId] || INITIAL_COL_WIDTHS[colId] || 100;
    setActiveResizingCol(colId);

    document.addEventListener('mousemove', handleMouseMoveResize);
    document.addEventListener('mouseup', handleMouseUpResize);
  };

  const handleMouseMoveResize = useCallback((e) => {
    if (!resizingColRef.current) return;
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.max(65, startWidthRef.current + diff);
    setColWidths(prev => {
      const updated = { ...prev, [resizingColRef.current]: newWidth };
      return updated;
    });
  }, []);

  const handleMouseUpResize = useCallback(() => {
    if (resizingColRef.current) {
      setColWidths(current => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(current));
        } catch (_) {}
        return current;
      });
      resizingColRef.current = null;
      setActiveResizingCol(null);
    }
    document.removeEventListener('mousemove', handleMouseMoveResize);
    document.removeEventListener('mouseup', handleMouseUpResize);
  }, [storageKey]);

  const handleDoubleClickResetCol = (colId) => {
    setColWidths(prev => {
      const reset = { ...prev, [colId]: INITIAL_COL_WIDTHS[colId] || 120 };
      try {
        localStorage.setItem(storageKey, JSON.stringify(reset));
      } catch (_) {}
      return reset;
    });
  };

  // --- Modal Openers ---
  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormError(null);
    setFormData({
      name: '',
      sku: '',
      category: 'Implement',
      branchName: selectedBranch !== 'ALL' ? selectedBranch : 'All Branches',
      uom: 'Units',
      price: '',
      taxRate: 12,
      hsnCode: '8432',
      stockQuantity: '',
      minOrderQty: 1,
      description: '',
      isActive: true
    });
    setShowAddEditModal(true);
  };

  const handleOpenEditModal = (p) => {
    setEditingProduct(p);
    setFormError(null);
    setFormData({
      name: p.name || '',
      sku: p.sku || '',
      category: p.category || 'General',
      branchName: p.branch_name || 'All Branches',
      uom: p.uom || 'Units',
      price: p.price ?? '',
      taxRate: p.tax_rate ?? 12,
      hsnCode: p.hsn_code || '',
      stockQuantity: p.stock_quantity ?? '',
      minOrderQty: p.min_order_qty ?? 1,
      description: p.description || '',
      isActive: p.is_active !== false
    });
    setShowAddEditModal(true);
  };

  // --- Save Product Handler ---
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Product Name is required.');
      return;
    }

    setSavingProduct(true);
    setFormError(null);

    try {
      const payload = {
        id: editingProduct ? editingProduct.id : null,
        company: effectiveCompany,
        branchName: formData.branchName,
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        category: formData.category,
        uom: formData.uom,
        price: formData.price !== '' ? Number(formData.price) : 0,
        taxRate: Number(formData.taxRate) || 0,
        hsnCode: formData.hsnCode,
        stockQuantity: formData.stockQuantity !== '' ? Number(formData.stockQuantity) : 0,
        minOrderQty: Number(formData.minOrderQty) || 1,
        description: formData.description,
        isActive: formData.isActive
      };

      const res = await saveTenantProduct(payload);
      if (res.success && res.product) {
        showToast(res.message || 'Product saved successfully!');
        setShowAddEditModal(false);
        // Refresh local state immediately
        setProducts(prev => {
          const idx = prev.findIndex(item => item.id === res.product.id || (item.sku && item.sku === res.product.sku));
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = res.product;
            return updated;
          }
          return [res.product, ...prev];
        });
      } else {
        setFormError(res.error || 'Failed to save product.');
      }
    } catch (err) {
      console.error('Save product error:', err);
      setFormError(err.message || 'An unexpected error occurred.');
    } finally {
      setSavingProduct(false);
    }
  };

  // --- Toggle Active Status ---
  const handleToggleStatus = async (p) => {
    const nextStatus = !p.is_active;
    // Optimistic UI update
    setProducts(prev => prev.map(item => item.id === p.id ? { ...item, is_active: nextStatus } : item));
    try {
      const res = await toggleTenantProductStatus(p.id, effectiveCompany, nextStatus);
      if (!res.success) {
        // Rollback
        setProducts(prev => prev.map(item => item.id === p.id ? { ...item, is_active: p.is_active } : item));
        showToast('Failed to update status', 'error');
      } else {
        showToast(`Product set to ${nextStatus ? 'Active' : 'Inactive'}`);
      }
    } catch (_) {
      setProducts(prev => prev.map(item => item.id === p.id ? { ...item, is_active: p.is_active } : item));
      showToast('Error updating status', 'error');
    }
  };

  // --- Delete Product Handler ---
  const handleDeleteProduct = async (id) => {
    try {
      const res = await deleteTenantProduct(id, effectiveCompany);
      if (res.success) {
        setProducts(prev => prev.filter(p => p.id !== id));
        showToast('Product deleted successfully');
      } else {
        showToast(res.error || 'Failed to delete product', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error deleting product', 'error');
    } finally {
      setDeletingProductId(null);
    }
  };

  // --- Export to CSV ---
  const handleExportCSV = () => {
    if (filteredProducts.length === 0) {
      showToast('No products to export', 'error');
      return;
    }

    const headers = [
      'Name', 'SKU', 'Branch', 'Category', 'UOM', 'Price', 'Tax Rate %', 'HSN Code', 'Stock Qty', 'Min Order Qty', 'Status', 'Description'
    ];

    const rows = filteredProducts.map(p => [
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.sku || '').replace(/"/g, '""')}"`,
      `"${(p.branch_name || 'All Branches').replace(/"/g, '""')}"`,
      `"${(p.category || '').replace(/"/g, '""')}"`,
      `"${(p.uom || 'Units').replace(/"/g, '""')}"`,
      p.price || 0,
      p.tax_rate || 0,
      `"${(p.hsn_code || '').replace(/"/g, '""')}"`,
      p.stock_quantity || 0,
      p.min_order_qty || 1,
      p.is_active !== false ? 'Active' : 'Inactive',
      `"${(p.description || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `Products_${effectiveCompany.replace(/\s+/g, '_')}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filteredProducts.length} products to CSV!`);
  };

  // --- Import from CSV / Text ---
  const handleImportCSV = async () => {
    if (!importText.trim()) {
      setImportResult({ success: false, error: 'Please enter or paste CSV text.' });
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const lines = importText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        setImportResult({ success: false, error: 'CSV must contain at least a header row and 1 data row.' });
        setImporting(false);
        return;
      }

      // Parse headers
      const rawHeader = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
      const nameIdx = rawHeader.findIndex(h => h.includes('name') || h.includes('product'));
      const skuIdx = rawHeader.findIndex(h => h.includes('sku') || h.includes('code'));
      const branchIdx = rawHeader.findIndex(h => h.includes('branch'));
      const catIdx = rawHeader.findIndex(h => h.includes('cat'));
      const priceIdx = rawHeader.findIndex(h => h.includes('price') || h.includes('rate'));
      const uomIdx = rawHeader.findIndex(h => h.includes('uom') || h.includes('unit'));
      const hsnIdx = rawHeader.findIndex(h => h.includes('hsn'));
      const stockIdx = rawHeader.findIndex(h => h.includes('stock') || h.includes('qty'));

      if (nameIdx === -1) {
        setImportResult({ success: false, error: 'Header row must contain a "Name" or "Product Name" column.' });
        setImporting(false);
        return;
      }

      const parsedItems = [];
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const nameVal = row[nameIdx];
        if (!nameVal) continue;

        parsedItems.push({
          name: nameVal,
          sku: skuIdx >= 0 ? row[skuIdx] : '',
          branch_name: (branchIdx >= 0 && row[branchIdx]) ? row[branchIdx] : importBranch,
          category: catIdx >= 0 && row[catIdx] ? row[catIdx] : 'General',
          price: priceIdx >= 0 && !isNaN(Number(row[priceIdx])) ? Number(row[priceIdx]) : 0,
          uom: uomIdx >= 0 && row[uomIdx] ? row[uomIdx] : 'Units',
          hsn_code: hsnIdx >= 0 ? row[hsnIdx] : '',
          stock_quantity: stockIdx >= 0 && !isNaN(Number(row[stockIdx])) ? Number(row[stockIdx]) : 0,
          is_active: true
        });
      }

      if (parsedItems.length === 0) {
        setImportResult({ success: false, error: 'No valid products could be extracted.' });
        setImporting(false);
        return;
      }

      const res = await importTenantProducts(parsedItems, effectiveCompany, importBranch);
      if (res.success) {
        setImportResult({ success: true, count: res.count });
        showToast(res.message);
        setTimeout(() => {
          setShowImportModal(false);
          setImportText('');
          loadInitialData();
        }, 1200);
      } else {
        setImportResult({ success: false, error: res.error });
      }
    } catch (err) {
      setImportResult({ success: false, error: err.message || 'Import parsing failed.' });
    } finally {
      setImporting(false);
    }
  };

  // --- Filtered Products List ---
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // 1. Branch filter
      if (selectedBranch !== 'ALL') {
        const pBranch = (p.branch_name || 'All Branches').toLowerCase();
        const selBranch = selectedBranch.toLowerCase();
        if (pBranch !== 'all branches' && pBranch !== selBranch) {
          return false;
        }
      }

      // 2. Category filter
      if (selectedCategory !== 'ALL') {
        if ((p.category || '').toLowerCase() !== selectedCategory.toLowerCase()) {
          return false;
        }
      }

      // 3. Status filter
      if (statusFilter === 'ACTIVE' && p.is_active === false) return false;
      if (statusFilter === 'INACTIVE' && p.is_active !== false) return false;

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (p.name || '').toLowerCase().includes(q);
        const matchSku = (p.sku || '').toLowerCase().includes(q);
        const matchCat = (p.category || '').toLowerCase().includes(q);
        const matchHsn = (p.hsn_code || '').toLowerCase().includes(q);
        const matchDesc = (p.description || '').toLowerCase().includes(q);
        return matchName || matchSku || matchCat || matchHsn || matchDesc;
      }

      return true;
    });
  }, [products, selectedBranch, selectedCategory, statusFilter, searchQuery]);

  // Unique categories in data
  const availableCategories = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORIES);
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  // Format INR Currency
  const formatINR = (val) => {
    const num = Number(val) || 0;
    return `₹${num.toLocaleString('en-IN')}`;
  };

  // Format IST Date
  const formatISTDate = (isoStr) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch (_) {
      return isoStr;
    }
  };

  return (
    <div style={{ padding: '1.5rem', width: '100%', boxSizing: 'border-box', background: '#f8fafc', minHeight: '100%' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '24px',
          zIndex: 9999,
          background: toastMessage.type === 'error' ? '#ef4444' : '#10b981',
          color: '#ffffff',
          padding: '0.65rem 1.25rem',
          borderRadius: '8px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.875rem',
          fontWeight: 600
        }}>
          {toastMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Page Title & Stats Card */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        border: '1px solid #e2e8f0',
        marginBottom: '1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(59, 130, 246, 0.25)'
            }}>
              <Package size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                  Product List & Catalog
                </h2>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  fontWeight: 600,
                  border: '1px solid #bfdbfe'
                }}>
                  {effectiveCompany}
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: '#64748b' }}>
                Manage items, machinery, spare parts, rates, and stock allocations across all workspace branches.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh Products"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#475569',
                cursor: 'pointer',
                fontSize: '0.825rem',
                fontWeight: 600
              }}
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleExportCSV}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                cursor: 'pointer',
                fontSize: '0.825rem',
                fontWeight: 600
              }}
            >
              <Download size={15} />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => {
                setShowImportModal(true);
                setImportResult(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                cursor: 'pointer',
                fontSize: '0.825rem',
                fontWeight: 600
              }}
            >
              <Upload size={15} />
              <span>Import CSV</span>
            </button>

            <button
              onClick={handleOpenAddModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '0.825rem',
                fontWeight: 600,
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
              }}
            >
              <Plus size={16} />
              <span>Add Product</span>
            </button>
          </div>
        </div>

        {/* Quick Summary Pill Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginTop: '1.25rem',
          paddingTop: '1rem',
          borderTop: '1px solid #f1f5f9'
        }}>
          <div style={{ padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Total Products</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{products.length}</div>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>Active Catalog</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#15803d', marginTop: '2px' }}>
              {products.filter(p => p.is_active !== false).length}
            </div>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 600 }}>Registered Branches</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb', marginTop: '2px' }}>
              {branches.length > 0 ? branches.length : 1}
            </div>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', background: '#faf5ff', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b21a8', fontWeight: 600 }}>Product Categories</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7e22ce', marginTop: '2px' }}>
              {new Set(products.map(p => p.category || 'General')).size}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '0.85rem 1.25rem',
        border: '1px solid #e2e8f0',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        {/* Search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: '#f8fafc',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '0.45rem 0.75rem',
          flex: '1 1 240px',
          minWidth: '220px'
        }}>
          <Search size={16} color="#64748b" />
          <input
            type="text"
            placeholder="Search by name, SKU, HSN, or details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '0.825rem',
              width: '100%',
              color: '#1e293b'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
            >
              <X size={14} color="#94a3b8" />
            </button>
          )}
        </div>

        {/* Branch Filter (TENANT'S BRANCH-WISE FILTER) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Building2 size={16} color="#64748b" />
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: '0.825rem',
              color: '#334155',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <option value="ALL">🏢 All Branches (Universal View)</option>
            {branches.map(b => (
              <option key={b.id || b.branch_code} value={b.branch_name}>
                📍 {b.branch_name} ({b.branch_code || 'HQ'})
              </option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Layers size={16} color="#64748b" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: '0.825rem',
              color: '#334155',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <option value="ALL">📁 All Categories</option>
            {availableCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            fontSize: '0.825rem',
            color: '#334155',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <option value="ALL">⚡ All Status</option>
          <option value="ACTIVE">🟢 Active Only</option>
          <option value="INACTIVE">🔴 Inactive Only</option>
        </select>

        {/* Column Reset Hint */}
        <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#94a3b8' }}>
          💡 Double-click column divider to reset width
        </div>
      </div>

      {/* Main Table Card */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
            <div style={{
              width: '36px',
              height: '36px',
              border: '3px solid #e2e8f0',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              margin: '0 auto 1rem auto',
              animation: 'spin 1s linear infinite'
            }} />
            <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>Loading workspace products...</div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#64748b' }}>
            <Package size={44} color="#94a3b8" style={{ margin: '0 auto 1rem auto' }} />
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#1e293b', fontSize: '1.1rem' }}>No Products Found</h3>
            <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.85rem', color: '#64748b' }}>
              {searchQuery || selectedBranch !== 'ALL' || selectedCategory !== 'ALL' || statusFilter !== 'ALL'
                ? 'No products matched your active filters. Try resetting the search or filters.'
                : 'No products added to this workspace yet. Click below to add your first branch product.'}
            </p>
            <button
              onClick={handleOpenAddModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}
            >
              <Plus size={16} />
              <span>Add First Product</span>
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%', position: 'relative' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                  
                  {/* Status Col */}
                  <th style={{ width: colWidths.status, minWidth: '70px', position: 'relative', padding: '0.75rem 1rem' }}>
                    Status
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'status')}
                      onDoubleClick={() => handleDoubleClickResetCol('status')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'status' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* Name Col */}
                  <th style={{ width: colWidths.name, minWidth: '140px', position: 'relative', padding: '0.75rem 1rem' }}>
                    Product Name
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'name')}
                      onDoubleClick={() => handleDoubleClickResetCol('name')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'name' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* SKU Col */}
                  <th style={{ width: colWidths.sku, minWidth: '90px', position: 'relative', padding: '0.75rem 1rem' }}>
                    SKU / Code
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'sku')}
                      onDoubleClick={() => handleDoubleClickResetCol('sku')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'sku' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* Branch Col */}
                  <th style={{ width: colWidths.branch, minWidth: '120px', position: 'relative', padding: '0.75rem 1rem' }}>
                    Branch / Location
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'branch')}
                      onDoubleClick={() => handleDoubleClickResetCol('branch')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'branch' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* Category Col */}
                  <th style={{ width: colWidths.category, minWidth: '100px', position: 'relative', padding: '0.75rem 1rem' }}>
                    Category
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'category')}
                      onDoubleClick={() => handleDoubleClickResetCol('category')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'category' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* Price Col */}
                  <th style={{ width: colWidths.price, minWidth: '100px', position: 'relative', padding: '0.75rem 1rem', textAlign: 'right' }}>
                    Base Price
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'price')}
                      onDoubleClick={() => handleDoubleClickResetCol('price')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'price' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* Tax Col */}
                  <th style={{ width: colWidths.tax, minWidth: '70px', position: 'relative', padding: '0.75rem 1rem', textAlign: 'center' }}>
                    GST %
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'tax')}
                      onDoubleClick={() => handleDoubleClickResetCol('tax')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'tax' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* HSN Col */}
                  <th style={{ width: colWidths.hsn, minWidth: '80px', position: 'relative', padding: '0.75rem 1rem' }}>
                    HSN
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'hsn')}
                      onDoubleClick={() => handleDoubleClickResetCol('hsn')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'hsn' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* Stock Col */}
                  <th style={{ width: colWidths.stock, minWidth: '80px', position: 'relative', padding: '0.75rem 1rem', textAlign: 'center' }}>
                    Stock
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'stock')}
                      onDoubleClick={() => handleDoubleClickResetCol('stock')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'stock' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* UOM Col */}
                  <th style={{ width: colWidths.uom, minWidth: '70px', position: 'relative', padding: '0.75rem 1rem' }}>
                    UOM
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'uom')}
                      onDoubleClick={() => handleDoubleClickResetCol('uom')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'uom' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* Updated At Col */}
                  <th style={{ width: colWidths.updated, minWidth: '100px', position: 'relative', padding: '0.75rem 1rem' }}>
                    Last Updated
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'updated')}
                      onDoubleClick={() => handleDoubleClickResetCol('updated')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'updated' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* Actions Col */}
                  <th style={{ width: colWidths.actions, minWidth: '90px', padding: '0.75rem 1rem', textAlign: 'center' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p, idx) => {
                  const isUniversal = !p.branch_name || p.branch_name === 'All Branches';
                  return (
                    <tr
                      key={p.id || p.sku || idx}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f0f9ff'}
                      onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafafa'}
                    >
                      {/* Status */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button
                          onClick={() => handleToggleStatus(p)}
                          title="Click to toggle status"
                          style={{
                            border: 'none',
                            background: p.is_active !== false ? '#dcfce7' : '#fee2e2',
                            color: p.is_active !== false ? '#15803d' : '#b91c1c',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '0.725rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: p.is_active !== false ? '#16a34a' : '#dc2626'
                          }} />
                          {p.is_active !== false ? 'Active' : 'Inactive'}
                        </button>
                      </td>

                      {/* Name */}
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>{p.name}</span>
                          {p.description && (
                            <span style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 400, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
                              {p.description}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* SKU */}
                      <td style={{ padding: '0.75rem 1rem', color: '#475569', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {p.sku || '-'}
                      </td>

                      {/* Branch */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          background: isUniversal ? '#eff6ff' : '#fef3c7',
                          color: isUniversal ? '#1d4ed8' : '#b45309',
                          border: `1px solid ${isUniversal ? '#bfdbfe' : '#fde68a'}`
                        }}>
                          <Building2 size={12} />
                          {p.branch_name || 'All Branches'}
                        </span>
                      </td>

                      {/* Category */}
                      <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#f1f5f9',
                          fontSize: '0.75rem',
                          color: '#475569'
                        }}>
                          {p.category || 'General'}
                        </span>
                      </td>

                      {/* Price */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                        {formatINR(p.price)}
                      </td>

                      {/* GST */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#64748b' }}>
                        {p.tax_rate ?? 12}%
                      </td>

                      {/* HSN */}
                      <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                        {p.hsn_code || '-'}
                      </td>

                      {/* Stock */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span style={{
                          fontWeight: 600,
                          color: Number(p.stock_quantity) > 0 ? '#0f172a' : '#94a3b8'
                        }}>
                          {p.stock_quantity ?? 0}
                        </span>
                      </td>

                      {/* UOM */}
                      <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                        {p.uom || 'Units'}
                      </td>

                      {/* Last Updated */}
                      <td style={{ padding: '0.75rem 1rem', color: '#64748b', fontSize: '0.75rem' }}>
                        {formatISTDate(p.updated_at || p.created_at)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            onClick={() => handleOpenEditModal(p)}
                            title="Edit Product"
                            style={{
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              borderRadius: '6px',
                              padding: '4px 6px',
                              cursor: 'pointer',
                              color: '#2563eb'
                            }}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setDeletingProductId(p.id)}
                            title="Delete Product"
                            style={{
                              border: '1px solid #fecaca',
                              background: '#fff5f5',
                              borderRadius: '6px',
                              padding: '4px 6px',
                              cursor: 'pointer',
                              color: '#dc2626'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- ADD / EDIT PRODUCT MODAL --- */}
      {showAddEditModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '1.5rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '620px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Package size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                    {editingProduct ? 'Edit Product' : 'Add New Product'}
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.775rem', color: '#64748b' }}>
                    Branch allocation and catalog pricing for {effectiveCompany}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddEditModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveProduct} style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {formError && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: '0.825rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <AlertCircle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              {/* Branch Selector (Core Branch-wise Feature) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Target Branch Location *
                </label>
                <select
                  value={formData.branchName}
                  onChange={(e) => setFormData(prev => ({ ...prev, branchName: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontWeight: 500
                  }}
                >
                  <option value="All Branches">🌐 All Branches (Universal / Workspace Default)</option>
                  {branches.map(b => (
                    <option key={b.id || b.branch_code} value={b.branch_name}>
                      📍 {b.branch_name} ({b.branch_code || 'Office'})
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '2px', display: 'block' }}>
                  Select whether this product applies across the entire company or is restricted to a specific branch.
                </span>
              </div>

              {/* Product Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rotavator – Super Series, Laser Land Leveller"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* SKU & Category (2 cols) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    SKU / Product Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SWAN-ROT-01 (Auto-generated if empty)"
                    value={formData.sku}
                    onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Category
                  </label>
                  <input
                    type="text"
                    list="product-categories-list"
                    placeholder="e.g. Implement, Spare Part"
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  <datalist id="product-categories-list">
                    {DEFAULT_CATEGORIES.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Price, GST, and UOM (3 cols) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Base Price (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    GST %
                  </label>
                  <select
                    value={formData.taxRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, taxRate: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      background: '#ffffff'
                    }}
                  >
                    {TAX_SLABS.map(tax => (
                      <option key={tax} value={tax}>{tax}%</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Unit (UOM)
                  </label>
                  <select
                    value={formData.uom}
                    onChange={(e) => setFormData(prev => ({ ...prev, uom: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      background: '#ffffff'
                    }}
                  >
                    {UOM_OPTIONS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* HSN Code & Stock Qty */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    HSN / SAC Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 8432 or 843290"
                    value={formData.hsnCode}
                    onChange={(e) => setFormData(prev => ({ ...prev, hsnCode: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Stock / Inventory Qty
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, stockQuantity: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Specifications / Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Key features, specifications, compatibility..."
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Active Toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0'
              }}>
                <div>
                  <div style={{ fontSize: '0.825rem', fontWeight: 600, color: '#0f172a' }}>Active Status</div>
                  <div style={{ fontSize: '0.725rem', color: '#64748b' }}>Inactive products won't appear in order booking queues.</div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>

              {/* Footer Buttons */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '0.5rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid #e2e8f0'
              }}>
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  style={{
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  style={{
                    padding: '0.55rem 1.35rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                    opacity: savingProduct ? 0.7 : 1
                  }}
                >
                  {savingProduct ? 'Saving...' : editingProduct ? 'Update Product' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CSV IMPORT MODAL --- */}
      {showImportModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '1.5rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '560px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileSpreadsheet size={20} color="#2563eb" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                  Bulk Import Products (CSV)
                </h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Default Branch for Imported Products
                </label>
                <select
                  value={importBranch}
                  onChange={(e) => setImportBranch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    background: '#ffffff'
                  }}
                >
                  <option value="All Branches">🌐 All Branches (Universal)</option>
                  {branches.map(b => (
                    <option key={b.id || b.branch_code} value={b.branch_name}>
                      📍 {b.branch_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                    Paste CSV Data (Include Header)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setImportText(`Name,SKU,Category,Price,UOM,HSN,Stock\nRotavator Mini,SWAN-MINI-01,Implement,85000,Units,8432,15\nMould Board Plough,SWAN-MB-02,Implement,65000,Units,8432,10\nGenuine Blade 28T,SWAN-BLD-28,Spare Part,680,Pcs,843290,200`);
                    }}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#2563eb',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Paste Sample Template
                  </button>
                </div>
                <textarea
                  rows={6}
                  placeholder="Name,SKU,Category,Price,UOM,HSN,Stock&#10;Product A,SKU-001,Implement,50000,Units,8432,10"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {importResult && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: importResult.success ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${importResult.success ? '#bbf7d0' : '#fecaca'}`,
                  color: importResult.success ? '#15803d' : '#991b1b',
                  fontSize: '0.825rem'
                }}>
                  {importResult.success ? `Successfully imported ${importResult.count} products!` : importResult.error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={importing}
                  onClick={handleImportCSV}
                  style={{
                    padding: '0.55rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: importing ? 0.7 : 1
                  }}
                >
                  {importing ? 'Importing...' : 'Start Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- DELETE CONFIRM MODAL --- */}
      {deletingProductId && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '1.5rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '420px',
            padding: '1.5rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#b91c1c', fontSize: '1.1rem' }}>Delete Product?</h3>
            <p style={{ margin: '0 0 1.25rem 0', color: '#475569', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Are you sure you want to remove this product from the catalog? This action will remove it from future order selection.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setDeletingProductId(null)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProduct(deletingProductId)}
                style={{
                  padding: '0.5rem 1.15rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
