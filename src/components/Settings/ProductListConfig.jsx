'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Package, Plus, Search, Filter, Download, Upload, Edit3, Trash2,
  CheckCircle2, AlertCircle, X, RefreshCw, Building2, Layers,
  IndianRupee, Tag, BarChart3, ArrowUpDown, Check, FileSpreadsheet,
  Info, FileUp, FileText, Loader2, ChevronDown, Eye, CheckCircle, FileCheck,
  ShieldCheck
} from 'lucide-react';
import Papa from 'papaparse';
import { getTenantBranches } from '@/app/actions/tenantBranches';
import {
  getTenantProducts,
  saveTenantProduct,
  deleteTenantProduct,
  deleteTenantProductsBulk,
  toggleTenantProductStatus,
  importTenantProducts
} from '@/app/actions/tenantProducts';
import StandardTablePagination from '@/components/common/StandardTablePagination';

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
const TAX_SLABS = [0, 5, 18, 28];

const COVERAGE_TYPE_OPTIONS = ['Warranty', 'Guarantee', 'Both', 'None'];
const COVERAGE_UNIT_OPTIONS = ['Days', 'Months', 'Years'];

const COVERAGE_PERIOD_PRESETS_BY_UNIT = {
  Days: [
    { label: '7D', value: 7 },
    { label: '10D', value: 10 },
    { label: '15D', value: 15 },
    { label: '30D', value: 30 },
    { label: '45D', value: 45 },
    { label: '90D', value: 90 },
    { label: '100D', value: 100 },
    { label: '180D', value: 180 },
    { label: '365D', value: 365 }
  ],
  Months: [
    { label: '1M', value: 1 },
    { label: '2M', value: 2 },
    { label: '3M', value: 3 },
    { label: '6M', value: 6 },
    { label: '9M', value: 9 },
    { label: '12M', value: 12 },
    { label: '24M', value: 24 },
    { label: '36M', value: 36 },
    { label: '48M', value: 48 },
    { label: '60M', value: 60 },
    { label: '120M', value: 120 }
  ],
  Years: [
    { label: '1Y', value: 1 },
    { label: '2Y', value: 2 },
    { label: '3Y', value: 3 },
    { label: '5Y', value: 5 },
    { label: '10Y', value: 10 }
  ]
};

const formatCoveragePeriodDisplay = (period, unit = 'Months') => {
  if (period === undefined || period === null || period === '' || isNaN(Number(period))) return '-';
  const num = Number(period);
  const cleanUnit = (unit || 'Months').toLowerCase();
  if (cleanUnit.startsWith('day')) {
    return `${num} ${num === 1 ? 'Day' : 'Days'}`;
  }
  if (cleanUnit.startsWith('year')) {
    return `${num} ${num === 1 ? 'Year' : 'Years'}`;
  }
  return `${num}M (${num} ${num === 1 ? 'Month' : 'Months'})`;
};

const INITIAL_COL_WIDTHS = {
  select: 45,
  status: 90,
  name: 240,
  sku: 140,
  branch: 170,
  category: 140,
  subcategory: 130,
  coverage_type: 125,
  coverage_period: 125,
  coverage_terms: 175,
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

  // Page Navigation State (synced with Config Master)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const s = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (s.defaultPageSize) {
          return s.defaultPageSize === 'All' ? 100000 : (Number(s.defaultPageSize) || 25);
        }
      } catch (e) {}
    }
    return 25;
  });

  // Live Sync with Config Master Page Navigation Rules
  useEffect(() => {
    const syncNavSettings = () => {
      try {
        const s = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (s.defaultPageSize) {
          const defSize = s.defaultPageSize === 'All' ? 100000 : (Number(s.defaultPageSize) || 25);
          setPageSize(defSize);
        }
      } catch (e) {}
    };
    window.addEventListener('crm_page_nav_updated', syncNavSettings);
    window.addEventListener('crm_config_updated', syncNavSettings);
    return () => {
      window.removeEventListener('crm_page_nav_updated', syncNavSettings);
      window.removeEventListener('crm_config_updated', syncNavSettings);
    };
  }, []);

  // Automatic Page Reset when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedBranch, selectedCategory, statusFilter]);

  // Modals
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [formError, setFormError] = useState(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState('file'); // 'file' | 'text'
  const [importFile, setImportFile] = useState(null);
  const [parsedItems, setParsedItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importText, setImportText] = useState('');
  const [importBranch, setImportBranch] = useState('All Branches');
  const [importCategory, setImportCategory] = useState('General');
  const [importResult, setImportResult] = useState(null);
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewFilter, setPreviewFilter] = useState('ALL'); // 'ALL' | 'VALID' | 'ISSUES'
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const fileInputRef = useRef(null);
  const exportDropdownRef = useRef(null);

  // Delete confirm
  const [deletingProductId, setDeletingProductId] = useState(null);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

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
    subCategory: '',
    coverageType: 'Warranty',
    coveragePeriod: 12,
    coveragePeriodUnit: 'Months',
    coverageTerms: 'Manufacturing Defects Only',
    branchName: 'All Branches',
    uom: 'Units',
    price: '',
    taxRate: 18,
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

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      subCategory: '',
      coverageType: 'Warranty',
      coveragePeriod: 12,
      coveragePeriodUnit: 'Months',
      coverageTerms: 'Manufacturing Defects Only',
      branchName: selectedBranch !== 'ALL' ? selectedBranch : 'All Branches',
      uom: 'Units',
      price: '',
      taxRate: 18,
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
      subCategory: p.sub_category || '',
      coverageType: p.coverage_type || 'Warranty',
      coveragePeriod: p.coverage_period !== undefined && p.coverage_period !== null && p.coverage_period !== '' ? p.coverage_period : '',
      coveragePeriodUnit: p.coverage_period_unit || 'Months',
      coverageTerms: p.coverage_terms !== undefined && p.coverage_terms !== null ? p.coverage_terms : 'Manufacturing Defects Only',
      branchName: p.branch_name || 'All Branches',
      uom: p.uom || 'Units',
      price: p.price ?? '',
      taxRate: p.tax_rate ?? 18,
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
        subCategory: formData.subCategory,
        coverageType: formData.coverageType,
        coveragePeriod: formData.coveragePeriod !== '' && !isNaN(Number(formData.coveragePeriod)) ? Number(formData.coveragePeriod) : null,
        coveragePeriodUnit: formData.coveragePeriodUnit || 'Months',
        coverageTerms: formData.coverageTerms,
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
        setSelectedProductIds(prev => prev.filter(item => item !== id));
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

  // --- Bulk Selection Handlers ---
  const handleToggleSelectProduct = (id) => {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    const targetList = paginatedProducts.length > 0 ? paginatedProducts : filteredProducts;
    const allSelected = targetList.length > 0 && targetList.every(p => selectedProductIds.includes(p.id));
    if (allSelected) {
      setSelectedProductIds(prev => prev.filter(id => !targetList.some(p => p.id === id)));
    } else {
      setSelectedProductIds(prev => Array.from(new Set([...prev, ...targetList.map(p => p.id)])));
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await deleteTenantProductsBulk(selectedProductIds, effectiveCompany);
      if (res.success) {
        showToast(`Successfully deleted ${res.count} products!`);
        setProducts(prev => prev.filter(p => !selectedProductIds.includes(p.id)));
        setSelectedProductIds([]);
        setShowBulkDeleteConfirm(false);
      } else {
        showToast(res.error || 'Failed to delete selected products.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error deleting products.', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  // --- Export to CSV ---
  const handleExportCSV = () => {
    if (filteredProducts.length === 0) {
      showToast('No products to export', 'error');
      return;
    }

    const headers = [
      'Name', 'SKU', 'Branch', 'Category', 'Sub-Category', 'Coverage Type', 'Coverage Period', 'Coverage Duration', 'Coverage Terms', 'UOM', 'Price', 'Tax Rate %', 'HSN Code', 'Stock Qty', 'Min Order Qty', 'Status', 'Description'
    ];

    const rows = filteredProducts.map(p => [
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.sku || '').replace(/"/g, '""')}"`,
      `"${(p.branch_name || 'All Branches').replace(/"/g, '""')}"`,
      `"${(p.category || '').replace(/"/g, '""')}"`,
      `"${(p.sub_category || '').replace(/"/g, '""')}"`,
      `"${(p.coverage_type || 'None').replace(/"/g, '""')}"`,
      p.coverage_period !== undefined && p.coverage_period !== null ? p.coverage_period : '',
      `"${(p.coverage_period_unit || 'Months').replace(/"/g, '""')}"`,
      `"${(p.coverage_terms || '').replace(/"/g, '""')}"`,
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

  // --- Download Sample CSV Template ---
  const handleDownloadSampleCsv = () => {
    const headers = [
      'Name',
      'SKU',
      'Branch',
      'Category',
      'Sub-Category',
      'Coverage Type',
      'Coverage Period',
      'Coverage Duration',
      'Coverage Terms',
      'Price',
      'Tax Rate %',
      'HSN Code',
      'Stock Qty',
      'Min Order Qty',
      'UOM',
      'Description'
    ];

    const sampleRows = [
      ['Rotavator – Super Series', 'SWAN-ROTA-01', 'All Branches', 'Implement', 'Rotary Tiller', 'Warranty', '12', 'Months', 'Manufacturing Defects Only', '115000', '18', '8432', '15', '1', 'Units', 'Heavy duty super series rotavator with multi speed gearbox'],
      ['Laser Land Leveller', 'SWAN-LLL-02', 'NSMLR', 'Land Leveller', 'Dual Slope', 'Warranty', '24', 'Months', 'Manufacturing Defects Only', '325000', '18', '8432', '8', '1', 'Units', 'Precision dual slope transmitter receiver system'],
      ['Genuine Blade 28T', 'SWAN-BLD-28', 'All Branches', 'Spare Part', 'Rotary Blades', 'Guarantee', '45', 'Days', 'Breakage & Manufacturing Defects', '650', '18', '843290', '200', '10', 'Pcs', 'High carbon boron steel rotary tiller blades'],
      ['Quick Replacement Wear Kit', 'SWAN-KIT-07', 'All Branches', 'Spare Part', 'Fast Replacement', 'Guarantee', '7', 'Days', 'Instant 7 Days Replacement Policy', '1450', '18', '843290', '80', '5', 'Box', '7 Days instant customer replacement spare kit'],
      ['Super Seeder 8 Row', 'SWAN-SEED-08', 'NSTL', 'Seeder', 'Direct Sowing', 'Both', '100', 'Days', 'Comprehensive 100 Days Warranty & Field Guarantee', '245000', '18', '8432', '5', '1', 'Units', 'Next generation super seeder for direct sowing'],
      ['Hydraulic Reversible MB Plough', 'SWAN-PLOW-03', 'All Branches', 'Plough', 'Mould Board', 'Warranty', '12', 'Months', 'Manufacturing Defects Only', '95000', '18', '8432', '12', '1', 'Units', 'Heavy duty reversible mould board plough']
    ];

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...sampleRows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Product_Import_Sample_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Sample CSV template downloaded!');
  };

  // --- Download Sample Excel Template (.xlsx) ---
  const handleDownloadSampleExcel = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Swan CRM';
      const sheet = workbook.addWorksheet('Products');

      sheet.columns = [
        { header: 'Name', key: 'name', width: 32 },
        { header: 'SKU', key: 'sku', width: 18 },
        { header: 'Branch', key: 'branch', width: 20 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Sub-Category', key: 'sub_category', width: 18 },
        { header: 'Coverage Type', key: 'coverage_type', width: 18 },
        { header: 'Coverage Period', key: 'coverage_period', width: 18 },
        { header: 'Coverage Duration', key: 'coverage_period_unit', width: 18 },
        { header: 'Coverage Terms', key: 'coverage_terms', width: 32 },
        { header: 'Price', key: 'price', width: 14 },
        { header: 'Tax Rate %', key: 'tax_rate', width: 14 },
        { header: 'HSN Code', key: 'hsn', width: 14 },
        { header: 'Stock Qty', key: 'stock', width: 14 },
        { header: 'Min Order Qty', key: 'min_order_qty', width: 16 },
        { header: 'UOM', key: 'uom', width: 14 },
        { header: 'Description', key: 'description', width: 40 }
      ];

      // Style header row
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 24;

      const sampleData = [
        {
          name: 'Rotavator – Super Series',
          sku: 'SWAN-ROTA-01',
          branch: 'All Branches',
          category: 'Implement',
          sub_category: 'Rotary Tiller',
          coverage_type: 'Warranty',
          coverage_period: 12,
          coverage_period_unit: 'Months',
          coverage_terms: 'Manufacturing Defects Only',
          price: 115000,
          tax_rate: 18,
          hsn: '8432',
          stock: 15,
          min_order_qty: 1,
          uom: 'Units',
          description: 'Heavy duty super series rotavator with multi speed gearbox'
        },
        {
          name: 'Laser Land Leveller',
          sku: 'SWAN-LLL-02',
          branch: 'NSMLR',
          category: 'Land Leveller',
          sub_category: 'Dual Slope',
          coverage_type: 'Warranty',
          coverage_period: 24,
          coverage_period_unit: 'Months',
          coverage_terms: 'Manufacturing Defects Only',
          price: 325000,
          tax_rate: 18,
          hsn: '8432',
          stock: 8,
          min_order_qty: 1,
          uom: 'Units',
          description: 'Precision dual slope transmitter receiver system'
        },
        {
          name: 'Genuine Blade 28T',
          sku: 'SWAN-BLD-28',
          branch: 'All Branches',
          category: 'Spare Part',
          sub_category: 'Rotary Blades',
          coverage_type: 'Guarantee',
          coverage_period: 45,
          coverage_period_unit: 'Days',
          coverage_terms: 'Breakage & Manufacturing Defects',
          price: 650,
          tax_rate: 18,
          hsn: '843290',
          stock: 200,
          min_order_qty: 10,
          uom: 'Pcs',
          description: 'High carbon boron steel rotary tiller blades'
        },
        {
          name: 'Quick Replacement Wear Kit',
          sku: 'SWAN-KIT-07',
          branch: 'All Branches',
          category: 'Spare Part',
          sub_category: 'Fast Replacement',
          coverage_type: 'Guarantee',
          coverage_period: 7,
          coverage_period_unit: 'Days',
          coverage_terms: 'Instant 7 Days Replacement Policy',
          price: 1450,
          tax_rate: 18,
          hsn: '843290',
          stock: 80,
          min_order_qty: 5,
          uom: 'Box',
          description: '7 Days instant customer replacement spare kit'
        },
        {
          name: 'Super Seeder 8 Row',
          sku: 'SWAN-SEED-08',
          branch: 'NSTL',
          category: 'Seeder',
          sub_category: 'Direct Sowing',
          coverage_type: 'Both',
          coverage_period: 100,
          coverage_period_unit: 'Days',
          coverage_terms: 'Comprehensive 100 Days Warranty & Field Guarantee',
          price: 245000,
          tax_rate: 18,
          hsn: '8432',
          stock: 5,
          min_order_qty: 1,
          uom: 'Units',
          description: 'Next generation super seeder for direct sowing'
        },
        {
          name: 'Hydraulic Reversible MB Plough',
          sku: 'SWAN-PLOW-03',
          branch: 'All Branches',
          category: 'Plough',
          sub_category: 'Mould Board',
          coverage_type: 'Warranty',
          coverage_period: 12,
          coverage_period_unit: 'Months',
          coverage_terms: 'Manufacturing Defects Only',
          price: 95000,
          tax_rate: 18,
          hsn: '8432',
          stock: 12,
          min_order_qty: 1,
          uom: 'Units',
          description: 'Heavy duty reversible mould board plough'
        }
      ];

      sampleData.forEach(row => {
        sheet.addRow(row);
      });

      // Attach In-Cell Data Validation Dropdowns for rows 2 to 300
      for (let r = 2; r <= 300; r++) {
        // Column F: Coverage Type (Warranty / Guarantee / Both / None)
        sheet.getCell(`F${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Warranty,Guarantee,Both,None"'],
          showErrorMessage: true,
          errorTitle: 'Invalid Coverage Type',
          error: 'Please choose Warranty, Guarantee, Both, or None.'
        };
        // Column H: Coverage Duration (Days / Months / Years)
        sheet.getCell(`H${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Days,Months,Years"'],
          showErrorMessage: true,
          errorTitle: 'Invalid Coverage Duration',
          error: 'Please choose Days, Months, or Years.'
        };
        // Column K: Tax Rate %
        sheet.getCell(`K${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"0,5,12,18,28"']
        };
        // Column O: UOM
        sheet.getCell(`O${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Units,Pcs,Kg,Ton,Box,Set,Nos,Mtr,Ltr"']
        };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Product_Import_Sample_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Sample Excel template (.xlsx) with Dropdowns downloaded!');
    } catch (err) {
      console.error('Error generating Excel template:', err);
      showToast('Failed to download Excel template: ' + err.message, 'error');
    }
  };

  // --- Export Products to Excel (.xlsx) ---
  const handleExportExcel = async () => {
    if (filteredProducts.length === 0) {
      showToast('No products to export', 'error');
      return;
    }
    setIsExportingExcel(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Products');

      sheet.columns = [
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Name', key: 'name', width: 32 },
        { header: 'SKU', key: 'sku', width: 18 },
        { header: 'Branch', key: 'branch', width: 20 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Sub-Category', key: 'sub_category', width: 18 },
        { header: 'Coverage Type', key: 'coverage_type', width: 16 },
        { header: 'Coverage Period', key: 'coverage_period', width: 16 },
        { header: 'Coverage Duration', key: 'coverage_duration', width: 18 },
        { header: 'Coverage Terms', key: 'coverage_terms', width: 26 },
        { header: 'Price (₹)', key: 'price', width: 14 },
        { header: 'Tax Rate %', key: 'tax_rate', width: 14 },
        { header: 'HSN Code', key: 'hsn', width: 14 },
        { header: 'Stock Qty', key: 'stock', width: 14 },
        { header: 'UOM', key: 'uom', width: 12 },
        { header: 'Min Order Qty', key: 'moq', width: 14 },
        { header: 'Description', key: 'description', width: 35 }
      ];

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E40AF' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 24;

      filteredProducts.forEach(p => {
        sheet.addRow({
          status: p.is_active !== false ? 'Active' : 'Inactive',
          name: p.name || '',
          sku: p.sku || '',
          branch: p.branch_name || 'All Branches',
          category: p.category || '',
          sub_category: p.sub_category || '',
          coverage_type: p.coverage_type || 'None',
          coverage_period: p.coverage_period !== undefined && p.coverage_period !== null ? p.coverage_period : '',
          coverage_duration: p.coverage_period_unit || 'Months',
          coverage_terms: p.coverage_terms || '',
          price: p.price || 0,
          tax_rate: p.tax_rate || 0,
          hsn: p.hsn_code || '',
          stock: p.stock_quantity || 0,
          uom: p.uom || 'Units',
          moq: p.min_order_qty || 1,
          description: p.description || ''
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `Products_${effectiveCompany.replace(/\s+/g, '_')}_${dateStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Exported ${filteredProducts.length} products to Excel!`);
    } catch (err) {
      console.error('Export Excel error:', err);
      showToast('Export to Excel failed: ' + err.message, 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // --- Parse Products from parsed row objects ---
  const parseProductsFromRows = useCallback((rows, defaultBranch, defaultCategory) => {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    return rows.map((row, idx) => {
      if (!row || typeof row !== 'object') return null;
      const keys = Object.keys(row);
      const findVal = (...patterns) => {
        for (const pattern of patterns) {
          const matchKey = keys.find(k => k && k.trim().toLowerCase().includes(pattern));
          if (matchKey && row[matchKey] !== undefined && row[matchKey] !== null) {
            const val = String(row[matchKey]).trim();
            if (val) return val;
          }
        }
        return '';
      };

      const name = findVal('product name', 'item name', 'name', 'product');
      const sku = findVal('sku', 'item code', 'product code', 'code');
      const branchVal = findVal('branch name', 'branch', 'location');
      const subCategoryVal = findVal('sub category', 'sub-category', 'subcategory', 'sub_cat', 'subcat', 'sub cat');
      // Category pattern matching - ensure we don't accidentally match sub-category column
      const matchCatKey = keys.find(k => {
        const lk = (k || '').trim().toLowerCase();
        return (lk.includes('category') || lk === 'cat') && !lk.includes('sub');
      });
      const categoryVal = (matchCatKey && row[matchCatKey] !== undefined && row[matchCatKey] !== null && String(row[matchCatKey]).trim())
        ? String(row[matchCatKey]).trim()
        : findVal('category', 'cat');

      const coverageTypeVal = findVal('coverage type', 'coverage_type', 'warranty type', 'guarantee type') || 'Warranty';
      const coveragePeriodRaw = findVal('coverage period', 'coverage_period', 'period', 'warranty period', 'guarantee period');
      const coverageTermsVal = findVal('coverage terms', 'coverage_terms', 'terms', 'warranty terms', 'guarantee terms') || 'Manufacturing Defects Only';
      const cleanCoveragePeriod = coveragePeriodRaw && !isNaN(Number(String(coveragePeriodRaw).replace(/[^0-9]/g, '')))
        ? Number(String(coveragePeriodRaw).replace(/[^0-9]/g, ''))
        : null;
      const rawLowerPeriod = String(coveragePeriodRaw || '').toLowerCase();
      const rawCoverageUnit = findVal('coverage duration', 'coverage_duration', 'duration', 'coverage unit', 'coverage_unit', 'period unit', 'period_unit', 'coverage period unit', 'coverage_period_unit', 'unit of coverage');
      let coveragePeriodUnitVal = 'Months';
      if (rawCoverageUnit) {
        const lowerUnit = rawCoverageUnit.toLowerCase();
        if (lowerUnit.includes('day') || lowerUnit === 'd') coveragePeriodUnitVal = 'Days';
        else if (lowerUnit.includes('year') || lowerUnit === 'y') coveragePeriodUnitVal = 'Years';
        else coveragePeriodUnitVal = 'Months';
      } else if (rawLowerPeriod.includes('day') || rawLowerPeriod.endsWith('d')) {
        coveragePeriodUnitVal = 'Days';
      } else if (rawLowerPeriod.includes('year') || rawLowerPeriod.endsWith('y')) {
        coveragePeriodUnitVal = 'Years';
      }

      const uom = findVal('uom', 'unit') || 'Units';
      const priceStr = findVal('base price', 'unit price', 'price', 'rate', 'mrp');
      const taxRateStr = findVal('tax rate', 'tax %', 'gst %', 'tax', 'gst');
      const hsnCode = findVal('hsn code', 'hsn');
      const stockStr = findVal('stock quantity', 'stock qty', 'stock', 'quantity', 'qty');
      const minOrderStr = findVal('min order qty', 'min order', 'moq');
      const description = findVal('description', 'desc', 'details');

      const price = !isNaN(Number(priceStr)) && Number(priceStr) >= 0 ? Number(priceStr) : 0;
      const taxRate = !isNaN(Number(taxRateStr)) && Number(taxRateStr) >= 0 ? Number(taxRateStr) : 18;
      const stockQuantity = !isNaN(Number(stockStr)) && Number(stockStr) >= 0 ? Number(stockStr) : 0;
      const minOrderQty = !isNaN(Number(minOrderStr)) && Number(minOrderStr) >= 1 ? Number(minOrderStr) : 1;

      const isValid = Boolean(name && name.length > 0);
      const issues = [];
      if (!isValid) issues.push('Missing product name');

      return {
        _id: `parsed_${idx}_${Date.now()}`,
        _rowNum: idx + 1,
        _isValid: isValid,
        _issues: issues,
        name: name || '',
        sku: sku || '',
        branch_name: branchVal || defaultBranch || 'All Branches',
        category: categoryVal || defaultCategory || 'General',
        sub_category: subCategoryVal || '',
        coverage_type: coverageTypeVal,
        coverage_period: cleanCoveragePeriod,
        coverage_period_unit: coveragePeriodUnitVal,
        coverage_terms: coverageTermsVal,
        uom: uom,
        price,
        tax_rate: taxRate,
        hsn_code: hsnCode,
        stock_quantity: stockQuantity,
        min_order_qty: minOrderQty,
        description,
        is_active: true
      };
    }).filter(p => p !== null && (p.name || p.sku));
  }, []);

  const processUploadedFile = async (file) => {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const isXlsx = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
    const isCsv = lowerName.endsWith('.csv');

    if (!isXlsx && !isCsv) {
      setImportResult({ success: false, error: 'Please select a valid Excel (.xlsx, .xls) or CSV (.csv) file.' });
      return;
    }

    setImportFile(file);
    setImportResult(null);
    setPreviewSearch('');
    setPreviewFilter('ALL');

    try {
      if (isXlsx) {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        const arrayBuffer = await file.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0];

        if (!worksheet) {
          setParsedItems([]);
          setImportResult({ success: false, error: 'The uploaded Excel file contains no worksheets.' });
          return;
        }

        const worksheetHeaders = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
          const val = cell.value ? String(cell.value).trim().toLowerCase() : '';
          worksheetHeaders[colNumber] = val;
        });

        const rawRows = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // skip header
          const rowData = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = worksheetHeaders[colNumber];
            if (header) {
              let val = cell.value;
              if (val instanceof Date) {
                val = val.toISOString().split('T')[0];
              } else if (val && typeof val === 'object' && val.text) {
                val = val.text;
              } else if (val && typeof val === 'object' && val.result !== undefined) {
                val = val.result;
              }
              rowData[header] = val !== null && val !== undefined ? String(val).trim() : '';
            }
          });
          if (Object.values(rowData).some(v => v !== '')) {
            rawRows.push(rowData);
          }
        });

        const parsed = parseProductsFromRows(rawRows, importBranch, importCategory);
        setParsedItems(parsed);
        if (parsed.length === 0) {
          setImportResult({
            success: false,
            error: 'No valid products could be detected. Header row must contain "Name" or "Product Name".'
          });
        }
      } else {
        // CSV parsing
        Papa.parse(file, {
          header: true,
          skipEmptyLines: 'greedy',
          complete: (results) => {
            if (!results.data || results.data.length === 0) {
              setParsedItems([]);
              setImportResult({ success: false, error: 'The uploaded CSV file is empty.' });
              return;
            }
            const parsed = parseProductsFromRows(results.data, importBranch, importCategory);
            setParsedItems(parsed);
            if (parsed.length === 0) {
              setImportResult({
                success: false,
                error: 'No valid products could be detected. Header row must contain "Name" or "Product Name".'
              });
            }
          },
          error: (err) => {
            setImportResult({ success: false, error: `Failed to read CSV: ${err.message}` });
          }
        });
      }
    } catch (err) {
      console.error('File parsing error:', err);
      setImportResult({ success: false, error: `Error reading file: ${err.message}` });
    }
  };

  const handleParseRawText = () => {
    if (!importText.trim()) {
      setImportResult({ success: false, error: 'Please enter or paste CSV text first.' });
      return;
    }
    const res = Papa.parse(importText.trim(), { header: true, skipEmptyLines: 'greedy' });
    if (!res.data || res.data.length === 0) {
      setParsedItems([]);
      setImportResult({ success: false, error: 'No data rows found in pasted text.' });
      return;
    }
    const parsed = parseProductsFromRows(res.data, importBranch, importCategory);
    setParsedItems(parsed);
    if (parsed.length === 0) {
      setImportResult({ success: false, error: 'No valid products found. Header must contain "Name".' });
    } else {
      setImportResult(null);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleOpenImportModal = () => {
    setShowImportModal(true);
    setImportMode('file');
    setImportFile(null);
    setParsedItems([]);
    setImportResult(null);
    setImportText('');
    setPreviewSearch('');
    setPreviewFilter('ALL');
    setShowSampleDropdown(false);
    setIsDragging(false);
  };

  const handleCloseImportModal = () => {
    setShowImportModal(false);
    setImportFile(null);
    setParsedItems([]);
    setImportResult(null);
    setImportText('');
    setPreviewSearch('');
    setPreviewFilter('ALL');
    setShowSampleDropdown(false);
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Confirm & Upload All Valid Products ---
  const handleConfirmImport = async () => {
    const validItems = parsedItems.filter(p => p._isValid);
    if (validItems.length === 0) {
      setImportResult({ success: false, error: 'No valid products to import. Please ensure products have a Name.' });
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const cleanItems = validItems.map(p => ({
        name: p.name,
        sku: p.sku,
        branch_name: p.branch_name || importBranch,
        category: p.category || importCategory,
        sub_category: p.sub_category || '',
        coverage_type: p.coverage_type || 'Warranty',
        coverage_period: p.coverage_period,
        coverage_period_unit: p.coverage_period_unit || 'Months',
        coverage_terms: p.coverage_terms || 'Manufacturing Defects Only',
        uom: p.uom || 'Units',
        price: p.price || 0,
        tax_rate: p.tax_rate ?? 18,
        hsn_code: p.hsn_code || '',
        stock_quantity: p.stock_quantity || 0,
        min_order_qty: p.min_order_qty || 1,
        description: p.description || '',
        is_active: true
      }));

      const res = await importTenantProducts(cleanItems, effectiveCompany, importBranch);
      if (res.success) {
        setImportResult({ success: true, count: res.count });
        showToast(res.message || `Successfully imported ${res.count} products!`);
        setTimeout(() => {
          handleCloseImportModal();
          loadInitialData();
        }, 1300);
      } else {
        setImportResult({ success: false, error: res.error || 'Failed to import products.' });
      }
    } catch (err) {
      setImportResult({ success: false, error: err.message || 'Import failed unexpectedly.' });
    } finally {
      setImporting(false);
    }
  };

  // Preview filtering calculations
  const displayedPreviewRows = useMemo(() => {
    return parsedItems.filter(p => {
      if (previewFilter === 'VALID' && !p._isValid) return false;
      if (previewFilter === 'ISSUES' && p._isValid) return false;
      if (previewSearch.trim()) {
        const q = previewSearch.toLowerCase().trim();
        const matchesName = (p.name || '').toLowerCase().includes(q);
        const matchesSku = (p.sku || '').toLowerCase().includes(q);
        const matchesCat = (p.category || '').toLowerCase().includes(q);
        const matchesSubCat = (p.sub_category || '').toLowerCase().includes(q);
        const matchesBranch = (p.branch_name || '').toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesCat && !matchesSubCat && !matchesBranch) return false;
      }
      return true;
    });
  }, [parsedItems, previewFilter, previewSearch]);

  const previewValidCount = useMemo(() => parsedItems.filter(p => p._isValid).length, [parsedItems]);
  const previewIssuesCount = useMemo(() => parsedItems.filter(p => !p._isValid).length, [parsedItems]);

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
        const matchSubCat = (p.sub_category || '').toLowerCase().includes(q);
        const matchCoverageType = (p.coverage_type || '').toLowerCase().includes(q);
        const matchCoverageTerms = (p.coverage_terms || '').toLowerCase().includes(q);
        const matchHsn = (p.hsn_code || '').toLowerCase().includes(q);
        const matchDesc = (p.description || '').toLowerCase().includes(q);
        return matchName || matchSku || matchCat || matchSubCat || matchCoverageType || matchCoverageTerms || matchHsn || matchDesc;
      }

      return true;
    });
  }, [products, selectedBranch, selectedCategory, statusFilter, searchQuery]);

  // Paginated slice for table display
  const paginatedProducts = useMemo(() => {
    if (pageSize === 100000) return filteredProducts;
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

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

            {/* Export Dropdown */}
            <div style={{ position: 'relative' }} ref={exportDropdownRef}>
              <button
                type="button"
                onClick={() => setShowExportDropdown(prev => !prev)}
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
                <span>Export</span>
                <ChevronDown size={14} />
              </button>

              {showExportDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '6px',
                  background: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                  zIndex: 50,
                  minWidth: '185px',
                  overflow: 'hidden'
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowExportDropdown(false);
                      handleExportExcel();
                    }}
                    disabled={isExportingExcel}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      border: 'none',
                      background: 'transparent',
                      color: '#0f172a',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <FileSpreadsheet size={16} color="#16a34a" />
                    <span>Export to Excel (.xlsx)</span>
                  </button>
                  <div style={{ height: '1px', background: '#f1f5f9' }} />
                  <button
                    type="button"
                    onClick={() => {
                      setShowExportDropdown(false);
                      handleExportCSV();
                    }}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      border: 'none',
                      background: 'transparent',
                      color: '#0f172a',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <Download size={16} color="#2563eb" />
                    <span>Export to CSV (.csv)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Import Button */}
            <button
              onClick={handleOpenImportModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.95rem',
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
              <span>Import (CSV / Excel)</span>
            </button>

            {selectedProductIds.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.3)'
                }}
              >
                <Trash2 size={15} />
                <span>Delete Selected ({selectedProductIds.length})</span>
              </button>
            )}

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
          <>
            <div style={{ overflow: 'auto', width: '100%', position: 'relative', maxHeight: 'calc(100vh - 310px)', minHeight: '380px' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.825rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ background: '#f8fafc', color: '#475569', fontWeight: 600 }}>
                  
                  {/* Select All Checkbox */}
                  <th style={{ width: '45px', minWidth: '45px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 0.75rem', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={paginatedProducts.length > 0 && paginatedProducts.every(p => selectedProductIds.includes(p.id))}
                      onChange={handleToggleSelectAll}
                      style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#2563eb' }}
                    />
                  </th>

                  {/* Status Col */}
                  <th style={{ width: colWidths.status, minWidth: '70px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem' }}>
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
                  <th style={{ width: colWidths.name, minWidth: '140px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem' }}>
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
                  <th style={{ width: colWidths.sku, minWidth: '90px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem' }}>
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
                  <th style={{ width: colWidths.branch, minWidth: '120px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem' }}>
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
                  <th style={{ width: colWidths.category, minWidth: '100px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem' }}>
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

                  {/* Sub-Category Col */}
                  <th style={{ width: colWidths.subcategory, minWidth: '100px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem' }}>
                    Sub-Category
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'subcategory')}
                      onDoubleClick={() => handleDoubleClickResetCol('subcategory')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'subcategory' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* Coverage Type Col */}
                  <th style={{ width: colWidths.coverage_type, minWidth: '115px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem' }}>
                    Coverage Type
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'coverage_type')}
                      onDoubleClick={() => handleDoubleClickResetCol('coverage_type')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'coverage_type' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* Coverage Period Col */}
                  <th style={{ width: colWidths.coverage_period, minWidth: '120px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem', textAlign: 'center' }}>
                    Coverage Period
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'coverage_period')}
                      onDoubleClick={() => handleDoubleClickResetCol('coverage_period')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'coverage_period' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* Coverage Terms Col */}
                  <th style={{ width: colWidths.coverage_terms, minWidth: '140px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem' }}>
                    Coverage Terms
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, 'coverage_terms')}
                      onDoubleClick={() => handleDoubleClickResetCol('coverage_terms')}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize',
                        background: activeResizingCol === 'coverage_terms' ? '#2563eb' : 'transparent'
                      }}
                    />
                  </th>

                  {/* Price Col */}
                  <th style={{ width: colWidths.price, minWidth: '100px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem', textAlign: 'right' }}>
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
                  <th style={{ width: colWidths.tax, minWidth: '70px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem', textAlign: 'center' }}>
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
                  <th style={{ width: colWidths.hsn, minWidth: '80px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem' }}>
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
                  <th style={{ width: colWidths.stock, minWidth: '80px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem', textAlign: 'center' }}>
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
                  <th style={{ width: colWidths.uom, minWidth: '70px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem' }}>
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
                  <th style={{ width: colWidths.updated, minWidth: '100px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem' }}>
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
                  <th style={{ width: colWidths.actions, minWidth: '90px', position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0', padding: '0.75rem 1rem', textAlign: 'center' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map((p, idx) => {
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
                      {/* Checkbox */}
                      <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(p.id)}
                          onChange={() => handleToggleSelectProduct(p.id)}
                          style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#2563eb' }}
                        />
                      </td>

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

                      {/* Sub-Category */}
                      <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          fontSize: '0.75rem',
                          color: '#475569'
                        }}>
                          {p.sub_category || '-'}
                        </span>
                      </td>

                      {/* Coverage Type */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {p.coverage_type && p.coverage_type !== 'None' ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: p.coverage_type === 'Warranty' ? '#eff6ff' : (p.coverage_type === 'Guarantee' ? '#f3e8ff' : '#ecfdf5'),
                            color: p.coverage_type === 'Warranty' ? '#1d4ed8' : (p.coverage_type === 'Guarantee' ? '#6b21a8' : '#047857'),
                            border: `1px solid ${p.coverage_type === 'Warranty' ? '#bfdbfe' : (p.coverage_type === 'Guarantee' ? '#d8b4fe' : '#a7f3d0')}`
                          }}>
                            <ShieldCheck size={12} />
                            {p.coverage_type}
                          </span>
                        ) : (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            background: '#f1f5f9',
                            color: '#64748b',
                            border: '1px solid #e2e8f0'
                          }}>
                            {p.coverage_type || 'None'}
                          </span>
                        )}
                      </td>

                      {/* Coverage Period */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {p.coverage_period !== undefined && p.coverage_period !== null && p.coverage_period !== '' ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: (p.coverage_period_unit || '').toLowerCase().startsWith('day') ? '#fef3c7' : '#f8fafc',
                            color: (p.coverage_period_unit || '').toLowerCase().startsWith('day') ? '#92400e' : '#0f172a',
                            border: `1px solid ${(p.coverage_period_unit || '').toLowerCase().startsWith('day') ? '#fde68a' : '#cbd5e1'}`
                          }}>
                            {formatCoveragePeriodDisplay(p.coverage_period, p.coverage_period_unit)}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>-</span>
                        )}
                      </td>

                      {/* Coverage Terms */}
                      <td style={{ padding: '0.75rem 1rem', color: '#334155', fontSize: '0.8rem' }}>
                        {p.coverage_terms ? (
                          <span
                            title={p.coverage_terms}
                            style={{
                              display: 'inline-block',
                              maxWidth: '180px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {p.coverage_terms}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>-</span>
                        )}
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

          {/* Unified Standard Table Pagination */}
          <StandardTablePagination
            currentPage={currentPage}
            totalRecords={filteredProducts.length}
            pageSize={pageSize === 'All' ? 100000 : Number(pageSize || 25)}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            style={{ borderTop: '1px solid #e2e8f0', background: '#ffffff', borderRadius: '0 0 12px 12px' }}
          />
        </>
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

              {/* SKU, Category & Sub-Category (3 cols) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    SKU / Product Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SWAN-ROT-01"
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
                    placeholder="e.g. Implement"
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Sub-Category
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rotary Tiller"
                    value={formData.subCategory}
                    onChange={(e) => setFormData(prev => ({ ...prev, subCategory: e.target.value }))}
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

              {/* Coverage & Warranty Specification */}
              <div style={{
                padding: '0.85rem 1rem',
                background: '#f8fafc',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={16} color="#2563eb" />
                    Coverage & Warranty
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Warranty / Guarantee policies</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* Coverage Type */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Coverage Type
                    </label>
                    <select
                      value={formData.coverageType}
                      onChange={(e) => setFormData(prev => ({ ...prev, coverageType: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.85rem',
                        background: '#ffffff',
                        boxSizing: 'border-box'
                      }}
                    >
                      {COVERAGE_TYPE_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  {/* Coverage Period & Duration */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                        Coverage Period &amp; Duration
                      </label>
                      {/* Duration Selector Toggle (Days / Months / Years) */}
                      <div style={{ display: 'inline-flex', background: '#e2e8f0', borderRadius: '6px', padding: '2px', gap: '2px' }} title="Coverage Duration">
                        {COVERAGE_UNIT_OPTIONS.map(unit => {
                          const isActive = (formData.coveragePeriodUnit || 'Months') === unit;
                          return (
                            <button
                              key={unit}
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  coveragePeriodUnit: unit,
                                  coveragePeriod: unit === 'Days' && (Number(prev.coveragePeriod) > 365 || Number(prev.coveragePeriod) === 12) ? 10 : prev.coveragePeriod
                                }));
                              }}
                              style={{
                                border: 'none',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                fontSize: '0.72rem',
                                fontWeight: isActive ? 700 : 500,
                                background: isActive ? '#ffffff' : 'transparent',
                                color: isActive ? (unit === 'Days' ? '#d97706' : '#2563eb') : '#64748b',
                                cursor: 'pointer',
                                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {unit}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min="0"
                        placeholder={formData.coveragePeriodUnit === 'Days' ? 'e.g. 7, 10, 15, 45, 100' : 'e.g. 12'}
                        value={formData.coveragePeriod}
                        onChange={(e) => setFormData(prev => ({ ...prev, coveragePeriod: e.target.value }))}
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
                </div>

                {/* Quick Selection Buttons for Coverage Period (Dynamic by Days / Months / Years) */}
                <div>
                  <div style={{ fontSize: '0.725rem', color: '#64748b', marginBottom: '5px', fontWeight: 500 }}>
                    Quick Select {formData.coveragePeriodUnit || 'Months'} (Click to apply):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {(COVERAGE_PERIOD_PRESETS_BY_UNIT[formData.coveragePeriodUnit || 'Months'] || COVERAGE_PERIOD_PRESETS_BY_UNIT.Months).map(preset => {
                      const isSelected = Number(formData.coveragePeriod) === preset.value;
                      const isDays = (formData.coveragePeriodUnit || 'Months') === 'Days';
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, coveragePeriod: preset.value }))}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: isSelected ? 700 : 500,
                            border: `1px solid ${isSelected ? (isDays ? '#d97706' : '#2563eb') : '#cbd5e1'}`,
                            background: isSelected ? (isDays ? '#d97706' : '#2563eb') : '#ffffff',
                            color: isSelected ? '#ffffff' : '#334155',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Coverage Terms */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Coverage Terms
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Manufacturing Defects Only"
                    value={formData.coverageTerms}
                    onChange={(e) => setFormData(prev => ({ ...prev, coverageTerms: e.target.value }))}
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
                  <div style={{ fontSize: '0.725rem', color: '#64748b' }}>Inactive products won&apos;t appear in order booking queues.</div>
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
            maxWidth: parsedItems.length > 0 ? '920px' : '640px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden',
            transition: 'max-width 0.2s ease'
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
                <FileSpreadsheet size={22} color="#2563eb" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                    {parsedItems.length > 0
                      ? `Pre-Import Product Preview (${parsedItems.length} Records)`
                      : 'Bulk Import Products (CSV / Excel)'}
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                    {parsedItems.length > 0
                      ? `Review parsed items below before confirming upload for ${effectiveCompany}`
                      : `Upload or paste formatted product CSV or Excel (.xlsx) for ${effectiveCompany}`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseImportModal}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content Scrollable */}
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
              
              {/* STEP 1: UPLOAD / PASTE FORM (When no products are parsed yet) */}
              {parsedItems.length === 0 && (
                <>
                  {/* Sample Template Download Card with Dropdown */}
                  <div style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <Info size={20} color="#2563eb" style={{ flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1e3a8a' }}>
                          Need the Sample Product Template?
                        </div>
                        <div style={{ fontSize: '0.735rem', color: '#3b82f6' }}>
                          Download pre-formatted sample Excel or CSV with required columns
                        </div>
                      </div>
                    </div>

                    {/* Direct 1-Click Sample Template Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={handleDownloadSampleExcel}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0.5rem 0.95rem',
                          borderRadius: '8px',
                          border: '1.5px solid #16a34a',
                          background: '#f0fdf4',
                          color: '#15803d',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 1px 3px rgba(22, 163, 74, 0.15)',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#dcfce7'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#f0fdf4'; }}
                        title="Download sample Excel template with built-in Dropdown menus"
                      >
                        <FileSpreadsheet size={16} color="#16a34a" />
                        <span>Download Sample Excel (.xlsx) [With Dropdowns]</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadSampleCsv}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0.5rem 0.85rem',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#475569',
                          fontSize: '0.785rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; }}
                        title="Download sample CSV template"
                      >
                        <FileText size={15} color="#64748b" />
                        <span>Download CSV (.csv)</span>
                      </button>
                    </div>
                  </div>

                  {/* Dual Fallback Dropdowns: Branch & Category */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Default Branch for Imported Products
                      </label>
                      <select
                        value={importBranch}
                        onChange={(e) => setImportBranch(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.825rem',
                          background: '#ffffff',
                          color: '#0f172a'
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
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Default Category for Imported Products
                      </label>
                      <select
                        value={importCategory}
                        onChange={(e) => setImportCategory(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.825rem',
                          background: '#ffffff',
                          color: '#0f172a'
                        }}
                      >
                        {DEFAULT_CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>📁 {cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '-0.4rem', display: 'block' }}>
                    Applied automatically as defaults if a product row does not specify branch or category.
                  </span>

                  {/* Import Mode Tabs */}
                  <div>
                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      borderBottom: '1px solid #e2e8f0',
                      paddingBottom: '0.5rem'
                    }}>
                      <button
                        type="button"
                        onClick={() => setImportMode('file')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.45rem 0.85rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: importMode === 'file' ? '#eff6ff' : 'transparent',
                          color: importMode === 'file' ? '#2563eb' : '#64748b',
                          fontSize: '0.8rem',
                          fontWeight: importMode === 'file' ? 700 : 500,
                          cursor: 'pointer'
                        }}
                      >
                        <Upload size={14} />
                        <span>Upload File (Excel / CSV)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportMode('text')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.45rem 0.85rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: importMode === 'text' ? '#eff6ff' : 'transparent',
                          color: importMode === 'text' ? '#2563eb' : '#64748b',
                          fontSize: '0.8rem',
                          fontWeight: importMode === 'text' ? 700 : 500,
                          cursor: 'pointer'
                        }}
                      >
                        <FileText size={14} />
                        <span>Paste Raw CSV</span>
                      </button>
                    </div>
                  </div>

                  {/* Mode 1: File Upload (Excel or CSV) */}
                  {importMode === 'file' && (
                    <div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                      />

                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          border: isDragging ? '2px dashed #2563eb' : '2px dashed #cbd5e1',
                          borderRadius: '12px',
                          padding: '2rem 1.5rem',
                          textAlign: 'center',
                          backgroundColor: isDragging ? '#eff6ff' : '#f8fafc',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <FileUp size={38} color={isDragging ? '#2563eb' : '#64748b'} style={{ margin: '0 auto 0.6rem auto' }} />
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                          Click to Choose File or Drag & Drop
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.85rem' }}>
                          Supports Excel (.xlsx, .xls) and CSV (.csv) files
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          style={{
                            padding: '0.5rem 1.25rem',
                            borderRadius: '7px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: '#334155',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                          }}
                        >
                          Choose Excel / CSV File
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mode 2: Raw CSV Text */}
                  {importMode === 'text' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                          Paste CSV Data (Include Header)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setImportText(`Name,SKU,Branch,Category,Sub-Category,Price,Tax Rate %,HSN Code,Stock Qty,Min Order Qty,UOM,Description\nRotavator – Super Series,SWAN-ROTA-01,All Branches,Implement,Rotary Tiller,115000,18,8432,15,1,Units,Heavy duty super series rotavator\nLaser Land Leveller,SWAN-LLL-02,NSMLR,Land Leveller,Dual Slope,325000,18,8432,8,1,Units,Dual slope transmitter receiver system\nGenuine Blade 28T,SWAN-BLD-28,All Branches,Spare Part,Rotary Blades,650,18,843290,200,10,Pcs,High carbon boron steel blades`);
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
                        placeholder="Name,SKU,Branch,Category,Sub-Category,Price,Tax Rate %,HSN Code,Stock Qty,Min Order Qty,UOM,Description&#10;Rotavator,SWAN-01,All Branches,Implement,Rotary Tiller,85000,18,8432,10,1,Units,Sample item"
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
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={handleParseRawText}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.45rem 1rem',
                            borderRadius: '7px',
                            background: '#2563eb',
                            color: '#ffffff',
                            fontSize: '0.785rem',
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <Eye size={14} />
                          <span>Preview &amp; Validate Products</span>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* STEP 2: PREVIEW TABLE & CONFIRM UPLOAD (When products are parsed) */}
              {parsedItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  
                  {/* Top Bar: Source file name & filter pills */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.6rem',
                    padding: '0.65rem 0.85rem',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, fontSize: '0.825rem', color: '#0f172a' }}>
                        <FileSpreadsheet size={16} color="#16a34a" />
                        <span>{importFile ? importFile.name : 'Pasted CSV Data'}</span>
                        {importFile && (
                          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 400 }}>
                            ({(importFile.size / 1024).toFixed(1)} KB)
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setPreviewFilter('ALL')}
                          style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '5px',
                            fontSize: '0.735rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: previewFilter === 'ALL' ? '1px solid #2563eb' : '1px solid #cbd5e1',
                            background: previewFilter === 'ALL' ? '#eff6ff' : '#ffffff',
                            color: previewFilter === 'ALL' ? '#2563eb' : '#475569'
                          }}
                        >
                          All ({parsedItems.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewFilter('VALID')}
                          style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '5px',
                            fontSize: '0.735rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: previewFilter === 'VALID' ? '1px solid #16a34a' : '1px solid #cbd5e1',
                            background: previewFilter === 'VALID' ? '#f0fdf4' : '#ffffff',
                            color: previewFilter === 'VALID' ? '#16a34a' : '#475569'
                          }}
                        >
                          ✓ Ready ({previewValidCount})
                        </button>
                        {previewIssuesCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setPreviewFilter('ISSUES')}
                            style={{
                              padding: '0.25rem 0.6rem',
                              borderRadius: '5px',
                              fontSize: '0.735rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: previewFilter === 'ISSUES' ? '1px solid #dc2626' : '1px solid #fca5a5',
                              background: previewFilter === 'ISSUES' ? '#fef2f2' : '#ffffff',
                              color: '#dc2626'
                            }}
                          >
                            ⚠️ Issues ({previewIssuesCount})
                          </button>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setParsedItems([]);
                        setImportFile(null);
                        setImportResult(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#475569',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Change File
                    </button>
                  </div>

                  {/* Quick Search in Preview */}
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="text"
                      placeholder="Search preview by name, SKU, branch, or category..."
                      value={previewSearch}
                      onChange={(e) => setPreviewSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.45rem 2rem 0.45rem 2rem',
                        borderRadius: '7px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.8rem',
                        background: '#ffffff',
                        boxSizing: 'border-box'
                      }}
                    />
                    {previewSearch && (
                      <X
                        size={14}
                        onClick={() => setPreviewSearch('')}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', cursor: 'pointer' }}
                      />
                    )}
                  </div>

                  {/* Interactive Preview Table with Frozen Sticky Header */}
                  <div style={{
                    maxHeight: '340px',
                    overflow: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    background: '#ffffff'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.785rem', textAlign: 'left' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' }}>
                        <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', width: '45px' }}>#</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', minWidth: '180px' }}>Product Name</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', minWidth: '120px' }}>SKU</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', minWidth: '110px' }}>Category</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', minWidth: '110px' }}>Sub-Category</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', minWidth: '120px' }}>Coverage</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', minWidth: '120px' }}>Branch</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', minWidth: '90px', textAlign: 'right' }}>Price (₹)</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', minWidth: '70px', textAlign: 'right' }}>Tax %</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', minWidth: '75px', textAlign: 'right' }}>Stock</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', minWidth: '95px' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedPreviewRows.length === 0 ? (
                          <tr>
                            <td colSpan={11} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                              No products match the filter or search query.
                            </td>
                          </tr>
                        ) : (
                          displayedPreviewRows.map((r, i) => (
                            <tr
                              key={r._id || i}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                background: r._isValid ? 'transparent' : '#fef2f2'
                              }}
                            >
                              <td style={{ padding: '0.5rem 0.75rem', color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>{r._rowNum}</td>
                              <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}>
                                {r.name || <span style={{ color: '#dc2626', fontStyle: 'italic' }}>Missing Name</span>}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', color: '#334155', borderBottom: '1px solid #f1f5f9' }}>{r.sku || '-'}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#475569', borderBottom: '1px solid #f1f5f9' }}>{r.category || '-'}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#475569', borderBottom: '1px solid #f1f5f9' }}>{r.sub_category || '-'}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#475569', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: '#f1f5f9',
                                  fontSize: '0.72rem',
                                  color: '#334155'
                                }}>
                                  {r.coverage_type || 'Warranty'}{r.coverage_period ? ` (${formatCoveragePeriodDisplay(r.coverage_period, r.coverage_period_unit)})` : ''}
                                </span>
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#475569', borderBottom: '1px solid #f1f5f9' }}>{r.branch_name || '-'}</td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}>
                                ₹{Number(r.price || 0).toLocaleString('en-IN')}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#475569', borderBottom: '1px solid #f1f5f9' }}>{r.tax_rate}%</td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#475569', borderBottom: '1px solid #f1f5f9' }}>{r.stock_quantity}</td>
                              <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #f1f5f9' }}>
                                {r._isValid ? (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '4px',
                                    background: '#dcfce7',
                                    color: '#15803d',
                                    fontSize: '0.72rem',
                                    fontWeight: 700
                                  }}>
                                    <Check size={12} /> Ready
                                  </span>
                                ) : (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '4px',
                                    background: '#fee2e2',
                                    color: '#b91c1c',
                                    fontSize: '0.72rem',
                                    fontWeight: 700
                                  }}>
                                    <AlertCircle size={12} /> Issue
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status Message */}
              {importResult && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: importResult.success ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${importResult.success ? '#bbf7d0' : '#fecaca'}`,
                  color: importResult.success ? '#15803d' : '#991b1b',
                  fontSize: '0.825rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {importResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{importResult.success ? `Successfully imported ${importResult.count} products!` : importResult.error}</span>
                </div>
              )}

              {/* Actions Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {parsedItems.length > 0 && (
                    <span>
                      Showing <strong>{displayedPreviewRows.length}</strong> of <strong>{parsedItems.length}</strong> records (<strong>{previewValidCount}</strong> valid ready to import)
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={handleCloseImportModal}
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

                  {parsedItems.length > 0 ? (
                    <button
                      type="button"
                      disabled={importing || previewValidCount === 0}
                      onClick={handleConfirmImport}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.55rem 1.35rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#16a34a',
                        color: '#ffffff',
                        fontSize: '0.825rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)',
                        opacity: (importing || previewValidCount === 0) ? 0.6 : 1
                      }}
                    >
                      {importing ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Importing {previewValidCount} Products...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle size={15} />
                          <span>Confirm &amp; Upload All ({previewValidCount} Products)</span>
                        </>
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- BULK DELETE CONFIRM MODAL --- */}
      {showBulkDeleteConfirm && (
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
            maxWidth: '440px',
            padding: '1.5rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: '8px', background: '#fee2e2', color: '#dc2626' }}>
                <Trash2 size={20} />
              </div>
              <h3 style={{ margin: 0, color: '#b91c1c', fontSize: '1.1rem', fontWeight: 700 }}>
                Delete {selectedProductIds.length} Products?
              </h3>
            </div>
            <p style={{ margin: '0 0 1.25rem 0', color: '#475569', fontSize: '0.85rem', lineHeight: '1.5' }}>
              Are you sure you want to delete these <strong>{selectedProductIds.length}</strong> selected products from {effectiveCompany}&apos;s catalog? This action will remove them from future order punch selection.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(false)}
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
                type="button"
                disabled={bulkDeleting}
                onClick={handleConfirmBulkDelete}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 1.15rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: bulkDeleting ? 0.7 : 1
                }}
              >
                {bulkDeleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete All</span>
                )}
              </button>
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
