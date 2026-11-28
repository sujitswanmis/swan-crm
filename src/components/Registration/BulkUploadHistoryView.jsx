'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import useTableColumnResize, { ColumnResizer } from '@/utils/tableColumnResize';
import { getImportBatches, getImportBatchDetails } from '@/app/actions/dataImport';
import {
  History,
  FileSpreadsheet,
  Eye,
  RefreshCw,
  ArrowLeft,
  Search,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  User,
  Clock,
  FileText,
  Layers
} from 'lucide-react';

const CACHE_PREFIX = 'crm_bulk_upload_batches_v1:';
const IDB_NAME = 'crm_bulk_upload_history_db';
const IDB_STORE = 'snapshots';
const memoryCache = new Map();

const DEFAULT_WIDTHS = {
  seq: 56,
  batch_ref: 170,
  file_name: 240,
  uploader: 200,
  created_at: 185,
  total_records: 95,
  imported: 175,
  duplicates: 130,
  failed: 105,
  status: 145,
  actions: 130
};

const MIN_WIDTHS = {
  seq: 50,
  batch_ref: 120,
  file_name: 160,
  uploader: 140,
  created_at: 140,
  total_records: 80,
  imported: 130,
  duplicates: 100,
  failed: 85,
  status: 110,
  actions: 110
};

function getISTDateKey(dateInput = new Date()) {
  try {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch {
    return '';
  }
}

function formatISTDateTime(dateInput) {
  if (!dateInput) return '—';
  try {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return String(dateInput);
    return `${d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })} IST`;
  } catch {
    return String(dateInput);
  }
}

function shiftISTDateKey(istDateKey, deltaDays) {
  if (!istDateKey) return '';
  const base = new Date(`${istDateKey}T00:00:00+05:30`);
  if (Number.isNaN(base.getTime())) return '';
  base.setTime(base.getTime() + deltaDays * 86400000);
  return getISTDateKey(base);
}

function buildCompactBatch(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    batch_ref_code: row.batch_ref_code,
    import_module: row.import_module,
    created_at: row.created_at,
    total_records: Number(row.total_records || 0),
    successful_records: Number(row.successful_records || 0),
    failed_records: Number(row.failed_records || 0),
    status: row.status,
    display_status: row.display_status,
    imported_by: row.imported_by,
    file_name: row.file_name,
    file_size: Number(row.file_size || 0),
    file_size_label: row.file_size_label,
    file_type: row.file_type,
    uploader_name: row.uploader_name,
    uploader_email: row.uploader_email,
    uploader_role: row.uploader_role,
    our_company: row.our_company,
    uploaded_at_ist: row.uploaded_at_ist,
    drafts_count: Number(row.drafts_count || 0),
    registered_count: Number(row.registered_count || 0),
    duplicates_count: Number(row.duplicates_count || 0),
    already_in_report_count: Number(row.already_in_report_count || 0),
    potential_matches_count: Number(row.potential_matches_count || 0),
    default_data_status: row.default_data_status || '',
    first_lead_ref: row.first_lead_ref || '',
    last_lead_ref: row.last_lead_ref || ''
  };
}

function openHistoryDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function getBulkUploadSnapshot(scopeKey = 'default') {
  if (memoryCache.has(scopeKey)) {
    return memoryCache.get(scopeKey);
  }
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${scopeKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.rows)) {
          const snap = { rows: parsed.rows, cursor: parsed.cursor || null };
          memoryCache.set(scopeKey, snap);
          return snap;
        }
      }
    } catch {
      // Ignore storage read errors safely
    }
  }
  return { rows: [], cursor: null };
}

export async function readBulkUploadCache(scopeKey = 'default') {
  const fast = getBulkUploadSnapshot(scopeKey);
  const db = await openHistoryDb();
  if (!db) return fast;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(scopeKey);
      req.onsuccess = () => {
        const stored = req.result;
        if (stored && Array.isArray(stored.rows) && stored.rows.length > 0) {
          const snap = { rows: stored.rows, cursor: stored.cursor || fast.cursor || null };
          memoryCache.set(scopeKey, snap);
          resolve(snap);
        } else {
          resolve(fast);
        }
      };
      req.onerror = () => resolve(fast);
    } catch {
      resolve(fast);
    }
  });
}

export async function mergeAndSaveBulkUploadCache(scopeKey = 'default', incomingRows = []) {
  const existing = getBulkUploadSnapshot(scopeKey);
  const map = new Map((existing.rows || []).map(r => [r.id, r]));
  let maxCursor = existing.cursor || null;

  for (const row of (incomingRows || [])) {
    if (!row || !row.id) continue;
    const prev = map.get(row.id) || {};
    map.set(row.id, { ...prev, ...row });
    if (row.created_at && (!maxCursor || String(row.created_at) > String(maxCursor))) {
      maxCursor = row.created_at;
    }
  }

  const merged = Array.from(map.values()).sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
  const fullSnap = { rows: merged, cursor: maxCursor };
  memoryCache.set(scopeKey, fullSnap);

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const compactSnap = {
        rows: merged.slice(0, 150).map(buildCompactBatch).filter(Boolean),
        cursor: maxCursor
      };
      localStorage.setItem(`${CACHE_PREFIX}${scopeKey}`, JSON.stringify(compactSnap));
    } catch {
      // Ignore quota exceeded
    }
  }

  const db = await openHistoryDb();
  if (db) {
    try {
      await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(fullSnap, scopeKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Non-blocking IDB write
    }
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('crm_bulk_upload_recorded', {
      detail: { scopeKey, count: merged.length }
    }));
  }

  return fullSnap;
}

function getStatusBadgeStyle(displayStatus) {
  const st = String(displayStatus || 'COMPLETED').toUpperCase();
  if (st === 'FAILED') {
    return {
      label: 'Failed',
      bg: '#fee2e2',
      color: '#b91c1c',
      border: '#fecaca'
    };
  }
  if (st === 'PARTIAL') {
    return {
      label: 'Partial',
      bg: '#fef3c7',
      color: '#b45309',
      border: '#fde68a'
    };
  }
  if (st === 'DUPLICATES_SKIPPED') {
    return {
      label: 'All Duplicates',
      bg: '#ffedd5',
      color: '#c2410c',
      border: '#fed7aa'
    };
  }
  return {
    label: 'Completed',
    bg: '#dcfce7',
    color: '#15803d',
    border: '#bbf7d0'
  };
}

function escapeCsvField(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function BulkUploadHistoryView({
  userCompany = '',
  adminCompanyFilter = 'All',
  userId = '',
  userName = '',
  userRole = '',
  canViewAllUploads = false,
  initialSelectedBatchId = null,
  onClearSelectedBatch = null,
  onCountChange = null,
  onBackToForm = null
}) {
  const scopeKey = useMemo(
    () => `${userCompany || 'default'}:${adminCompanyFilter || 'All'}:${canViewAllUploads ? 'all' : (userId || userName || 'self')}`,
    [userCompany, adminCompanyFilter, canViewAllUploads, userId, userName]
  );

  const initialSnap = getBulkUploadSnapshot(scopeKey);
  const [batches, setBatches] = useState(initialSnap.rows || []);
  const cursorRef = useRef(initialSnap.cursor || null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [serverCanViewAll, setServerCanViewAll] = useState(canViewAllUploads);
  const [currentUserId, setCurrentUserId] = useState(userId || '');

  // Filters & Pagination (every filter change resets page to 1)
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all'); // 'all' | 'my'
  const [uploaderFilter, setUploaderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [datePeriod, setDatePeriod] = useState('all'); // 'all' | 'today' | '7d' | 'month' | 'custom'
  const [customFrom, setCustomFrom] = useState(() => getISTDateKey());
  const [customTo, setCustomTo] = useState(() => getISTDateKey());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const s = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (s.defaultPageSize) {
          return s.defaultPageSize === 'All' ? 100000 : (parseInt(s.defaultPageSize, 10) || 25);
        }
      } catch {}
    }
    return 25;
  });

  // Details Modal
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [detailTab, setDetailTab] = useState('duplicates'); // 'duplicates' | 'errors' | 'mapping'
  const [loadingDetails, setLoadingDetails] = useState(false);

  const resizing = useTableColumnResize(
    'crm_registration_bulk_upload_history_widths_v1',
    DEFAULT_WIDTHS,
    MIN_WIDTHS
  );

  const syncBatches = useCallback(async (forceFull = false) => {
    setErrorMsg('');
    try {
      const cached = await readBulkUploadCache(scopeKey);
      setLoading(true);
      if (cached.rows.length > 0) {
        setBatches(cached.rows);
        cursorRef.current = cached.cursor || cursorRef.current;
      }

      const res = await getImportBatches({
        importModule: 'lead_registration',
        sinceCursor: forceFull ? null : cursorRef.current,
        userCompany
      });

      if (!res?.success) {
        throw new Error(res?.error || 'Could not load bulk upload history.');
      }

      if (typeof res.canViewAllUploads === 'boolean') {
        setServerCanViewAll(res.canViewAllUploads);
      }
      if (res.currentUserId) {
        setCurrentUserId(res.currentUserId);
      }

      const incoming = Array.isArray(res.batches) ? res.batches : [];
      if (incoming.length > 0 || forceFull) {
        const merged = await mergeAndSaveBulkUploadCache(scopeKey, incoming);
        setBatches(merged.rows);
        cursorRef.current = merged.cursor;
        if (typeof onCountChange === 'function') {
          onCountChange(merged.rows.length);
        }
      } else if (typeof onCountChange === 'function') {
        onCountChange(cached.rows.length);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to sync bulk upload history.');
    } finally {
      setLoading(false);
    }
  }, [scopeKey, userCompany, onCountChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      syncBatches(false);
    }, 0);
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return () => clearTimeout(timer);
    }

    const handleRefresh = () => syncBatches(false);
    const handleRecorded = () => {
      const snap = getBulkUploadSnapshot(scopeKey);
      if (snap.rows.length > 0) {
        setBatches(snap.rows);
        cursorRef.current = snap.cursor || cursorRef.current;
        if (typeof onCountChange === 'function') onCountChange(snap.rows.length);
      }
    };

    window.addEventListener('crm_leads_imported', handleRefresh);
    window.addEventListener('crm_trigger_delta_sync', handleRefresh);
    window.addEventListener('crm_bulk_upload_recorded', handleRecorded);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('crm_leads_imported', handleRefresh);
      window.removeEventListener('crm_trigger_delta_sync', handleRefresh);
      window.removeEventListener('crm_bulk_upload_recorded', handleRecorded);
    };
  }, [syncBatches, scopeKey, onCountChange]);

  const handleOpenBatchDetails = useCallback(async (batch) => {
    if (!batch) return;
    setSelectedBatch(batch);
    setDetailTab(
      (batch.duplicates_summary?.length || 0) > 0
        ? 'duplicates'
        : ((batch.errors_summary?.length || 0) > 0 ? 'errors' : 'mapping')
    );

    const hasArrays =
      Array.isArray(batch.duplicates_summary) &&
      Array.isArray(batch.errors_summary) &&
      batch.mapping &&
      Object.keys(batch.mapping).length > 0;

    if (!hasArrays && batch.id) {
      setLoadingDetails(true);
      try {
        const res = await getImportBatchDetails(batch.id, userCompany);
        if (res?.success && res.batch) {
          setSelectedBatch(res.batch);
          await mergeAndSaveBulkUploadCache(scopeKey, [res.batch]);
        }
      } catch {
        // Keep available summary if detail fetch fails
      } finally {
        setLoadingDetails(false);
      }
    }
  }, [scopeKey, userCompany]);

  useEffect(() => {
    if (!initialSelectedBatchId) return;
    const found = batches.find(b => b.id === initialSelectedBatchId);
    const timer = setTimeout(() => {
      handleOpenBatchDetails(found || { id: initialSelectedBatchId });
    }, 0);
    return () => clearTimeout(timer);
  }, [initialSelectedBatchId, batches, handleOpenBatchDetails]);

  const closeDetailsModal = () => {
    setSelectedBatch(null);
    if (typeof onClearSelectedBatch === 'function') {
      onClearSelectedBatch();
    }
  };

  const uniqueUploaders = useMemo(() => {
    const names = new Set();
    batches.forEach(b => {
      if (b.uploader_name) names.add(b.uploader_name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [batches]);

  const filteredBatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    const todayIST = getISTDateKey();
    const sevenDaysAgoIST = shiftISTDateKey(todayIST, -6);
    const monthPrefixIST = todayIST.slice(0, 7);

    return batches.filter((b) => {
      if (scopeFilter === 'my') {
        const isMine =
          (currentUserId && b.imported_by === currentUserId) ||
          (userName && String(b.uploader_name || '').toLowerCase().includes(userName.toLowerCase()));
        if (!isMine) return false;
      }

      if (uploaderFilter !== 'all' && b.uploader_name !== uploaderFilter) {
        return false;
      }

      if (statusFilter !== 'all' && String(b.display_status || '').toUpperCase() !== statusFilter) {
        return false;
      }

      if (datePeriod !== 'all') {
        const rowDateIST = getISTDateKey(b.created_at);
        if (!rowDateIST) return false;
        if (datePeriod === 'today' && rowDateIST !== todayIST) return false;
        if (datePeriod === '7d' && (rowDateIST < sevenDaysAgoIST || rowDateIST > todayIST)) return false;
        if (datePeriod === 'month' && !rowDateIST.startsWith(monthPrefixIST)) return false;
        if (datePeriod === 'custom') {
          if (customFrom && rowDateIST < customFrom) return false;
          if (customTo && rowDateIST > customTo) return false;
        }
      }

      if (term) {
        const haystack = [
          b.batch_ref_code,
          b.file_name,
          b.uploader_name,
          b.uploader_email,
          b.our_company,
          b.first_lead_ref,
          b.last_lead_ref,
          ...(b.created_refs_sample || [])
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  }, [
    batches,
    search,
    scopeFilter,
    uploaderFilter,
    statusFilter,
    datePeriod,
    customFrom,
    customTo,
    currentUserId,
    userName
  ]);

  const kpis = useMemo(() => {
    return filteredBatches.reduce(
      (acc, b) => {
        acc.files += 1;
        acc.totalRows += Number(b.total_records || 0);
        acc.imported += Number(b.successful_records || 0);
        acc.drafts += Number(b.drafts_count || 0);
        acc.registered += Number(b.registered_count || 0);
        acc.duplicates += Number(b.duplicates_count || 0);
        acc.failed += Number(b.failed_records || 0);
        return acc;
      },
      { files: 0, totalRows: 0, imported: 0, drafts: 0, registered: 0, duplicates: 0, failed: 0 }
    );
  }, [filteredBatches]);

  const effectivePageSize = pageSize === 100000 ? Math.max(1, filteredBatches.length) : Math.max(1, pageSize);
  const safePage = Math.min(page, Math.max(1, Math.ceil(filteredBatches.length / effectivePageSize)));
  const visibleBatches = filteredBatches.slice(
    (safePage - 1) * effectivePageSize,
    safePage * effectivePageSize
  );

  const handleExportBatchAuditCsv = (batch) => {
    if (!batch) return;
    const lines = [];
    lines.push(['Bulk Upload Audit Summary'].map(escapeCsvField).join(','));
    lines.push(['Batch Reference', batch.batch_ref_code].map(escapeCsvField).join(','));
    lines.push(['File Name', batch.file_name].map(escapeCsvField).join(','));
    lines.push(['File Size', batch.file_size_label].map(escapeCsvField).join(','));
    lines.push(['Uploaded By', `${batch.uploader_name}${batch.uploader_email ? ` (${batch.uploader_email})` : ''}`].map(escapeCsvField).join(','));
    lines.push(['Uploaded At (IST)', formatISTDateTime(batch.created_at)].map(escapeCsvField).join(','));
    lines.push(['Status', batch.display_status].map(escapeCsvField).join(','));
    lines.push(['Total Rows in File', batch.total_records].map(escapeCsvField).join(','));
    lines.push(['Successfully Imported', batch.successful_records].map(escapeCsvField).join(','));
    lines.push(['Saved as Drafts', batch.drafts_count].map(escapeCsvField).join(','));
    lines.push(['Registered Leads', batch.registered_count].map(escapeCsvField).join(','));
    lines.push(['Duplicates Skipped', batch.duplicates_count].map(escapeCsvField).join(','));
    lines.push(['Failed Rows', batch.failed_records].map(escapeCsvField).join(','));
    if (batch.first_lead_ref) {
      lines.push(['Lead Ref ID Range', `${batch.first_lead_ref} to ${batch.last_lead_ref || batch.first_lead_ref}`].map(escapeCsvField).join(','));
    }

    lines.push('');
    lines.push(['Field Mapping'].map(escapeCsvField).join(','));
    lines.push(['CRM Field', 'Uploaded Column'].map(escapeCsvField).join(','));
    Object.entries(batch.mapping || {}).forEach(([crmField, csvHeader]) => {
      lines.push([crmField, csvHeader].map(escapeCsvField).join(','));
    });

    if ((batch.duplicates_summary || []).length > 0) {
      lines.push('');
      lines.push(['Duplicate / Skipped Rows'].map(escapeCsvField).join(','));
      lines.push(['Row #', 'Company / Name', 'Phone / GST', 'Type', 'Reason'].map(escapeCsvField).join(','));
      batch.duplicates_summary.forEach((d) => {
        lines.push([d.row, d.company || d.name, d.contact || d.gst || '', d.category || 'Duplicate', d.reason || ''].map(escapeCsvField).join(','));
      });
    }

    if ((batch.errors_summary || []).length > 0) {
      lines.push('');
      lines.push(['Failed Rows'].map(escapeCsvField).join(','));
      lines.push(['Row #', 'Company / Name', 'Phone', 'Error Reason'].map(escapeCsvField).join(','));
      batch.errors_summary.forEach((e) => {
        lines.push([e.row, e.company || e.name || '', e.phone || '', e.error || ''].map(escapeCsvField).join(','));
      });
    }

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bulk_Upload_Audit_${batch.batch_ref_code || 'report'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const columns = [
    ['seq', '#'],
    ['batch_ref', 'Batch Ref ID'],
    ['file_name', 'File Name'],
    ['uploader', 'Uploaded By'],
    ['created_at', 'Upload Date & Time (IST)'],
    ['total_records', 'Total Rows'],
    ['imported', 'Imported (Drafts / Reg)'],
    ['duplicates', 'Duplicates Skipped'],
    ['failed', 'Failed / Errors'],
    ['status', 'Status'],
    ['actions', 'Action']
  ];

  const totalTableWidth = columns.reduce((sum, [key]) => sum + (resizing.colWidths[key] || DEFAULT_WIDTHS[key]), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={20} color="var(--accent-color)" /> Bulk Upload History &amp; Audit Logs
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            Track every uploaded CSV/Excel file — kisne, kab (IST), kaun si file upload ki, kitne Drafts/Leads bane, aur kitne duplicates ya errors aaye.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => syncBatches(true)}
            disabled={loading}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '6px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Syncing...' : 'Refresh'}
          </button>

          {typeof onBackToForm === 'function' && (
            <button
              type="button"
              onClick={onBackToForm}
              style={{
                padding: '0.45rem 0.95rem',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--accent-color, #2563eb)',
                color: '#ffffff',
                fontSize: '0.84rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <ArrowLeft size={14} /> Back to New Lead Form
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
        <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)' }}>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Files Uploaded</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            {kpis.files.toLocaleString()}
          </div>
        </div>
        <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)' }}>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Rows Processed</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#2563eb', marginTop: '0.2rem' }}>
            {kpis.totalRows.toLocaleString()}
          </div>
        </div>
        <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
          <div style={{ fontSize: '0.76rem', color: '#166534', fontWeight: 600 }}>Successfully Imported</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#15803d', marginTop: '0.2rem' }}>
            {kpis.imported.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: '0.15rem' }}>
            Drafts: <strong>{kpis.drafts.toLocaleString()}</strong> | Registered: <strong>{kpis.registered.toLocaleString()}</strong>
          </div>
        </div>
        <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #fde68a', background: '#fffbeb' }}>
          <div style={{ fontSize: '0.76rem', color: '#92400e', fontWeight: 600 }}>Duplicates &amp; Failed</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#b45309', marginTop: '0.2rem' }}>
            {(kpis.duplicates + kpis.failed).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#92400e', marginTop: '0.15rem' }}>
            Duplicates: <strong>{kpis.duplicates.toLocaleString()}</strong> | Failed: <strong style={{ color: kpis.failed > 0 ? '#dc2626' : 'inherit' }}>{kpis.failed.toLocaleString()}</strong>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 240px', minWidth: '210px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.65rem', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search file name, batch ID, uploader, lead ref..."
            style={{
              width: '100%',
              padding: '0.45rem 0.65rem 0.45rem 2rem',
              fontSize: '0.84rem',
              borderRadius: '6px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)'
            }}
          />
        </div>

        {serverCanViewAll && (
          <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--bg-surface)', padding: '0.2rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
            <button
              type="button"
              onClick={() => { setScopeFilter('all'); setPage(1); }}
              style={{
                padding: '0.32rem 0.65rem',
                borderRadius: '5px',
                border: 'none',
                fontSize: '0.78rem',
                fontWeight: scopeFilter === 'all' ? 700 : 500,
                background: scopeFilter === 'all' ? 'var(--accent-color, #2563eb)' : 'transparent',
                color: scopeFilter === 'all' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              All Uploads
            </button>
            <button
              type="button"
              onClick={() => { setScopeFilter('my'); setPage(1); }}
              style={{
                padding: '0.32rem 0.65rem',
                borderRadius: '5px',
                border: 'none',
                fontSize: '0.78rem',
                fontWeight: scopeFilter === 'my' ? 700 : 500,
                background: scopeFilter === 'my' ? 'var(--accent-color, #2563eb)' : 'transparent',
                color: scopeFilter === 'my' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              My Uploads
            </button>
          </div>
        )}

        {serverCanViewAll && uniqueUploaders.length > 0 && (
          <select
            value={uploaderFilter}
            onChange={(e) => { setUploaderFilter(e.target.value); setPage(1); }}
            style={{
              padding: '0.45rem 0.6rem',
              fontSize: '0.82rem',
              borderRadius: '6px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)'
            }}
          >
            <option value="all">All Uploaders</option>
            {uniqueUploaders.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{
            padding: '0.45rem 0.6rem',
            fontSize: '0.82rem',
            borderRadius: '6px',
            border: '1px solid var(--border-light)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)'
          }}
        >
          <option value="all">All Status</option>
          <option value="COMPLETED">Completed</option>
          <option value="PARTIAL">Partial</option>
          <option value="DUPLICATES_SKIPPED">All Duplicates</option>
          <option value="FAILED">Failed</option>
        </select>

        <select
          value={datePeriod}
          onChange={(e) => { setDatePeriod(e.target.value); setPage(1); }}
          style={{
            padding: '0.45rem 0.6rem',
            fontSize: '0.82rem',
            borderRadius: '6px',
            border: '1px solid var(--border-light)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)'
          }}
        >
          <option value="all">All Dates (IST)</option>
          <option value="today">Today (IST)</option>
          <option value="7d">Last 7 Days</option>
          <option value="month">This Month</option>
          <option value="custom">Custom Range</option>
        </select>

        {datePeriod === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => { setCustomFrom(e.target.value); setPage(1); }}
              style={{
                padding: '0.38rem 0.5rem',
                fontSize: '0.8rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)'
              }}
            />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => { setCustomTo(e.target.value); setPage(1); }}
              style={{
                padding: '0.38rem 0.5rem',
                fontSize: '0.8rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)'
              }}
            />
          </div>
        )}
      </div>

      {errorMsg && (
        <div role="alert" style={{ padding: '0.65rem 0.9rem', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{errorMsg}</span>
          <button type="button" onClick={() => syncBatches(true)} style={{ padding: '0.25rem 0.6rem', borderRadius: '5px', border: '1px solid #fca5a5', background: '#fff', color: '#b91c1c', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
            Retry
          </button>
        </div>
      )}

      {/* Frozen Header Resizable Table */}
      <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-surface)' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)', minHeight: '380px' }}>
          <table style={{ width: totalTableWidth, minWidth: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.85rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)' }}>
              <tr>
                {columns.map(([key, label]) => (
                  <th
                    key={key}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      width: resizing.colWidths[key] || DEFAULT_WIDTHS[key],
                      padding: '0.75rem 0.85rem',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      backgroundColor: 'var(--bg-surface)',
                      boxShadow: 'inset 0 -1px 0 var(--border-light)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {label}
                    <ColumnResizer
                      colKey={key}
                      isResizing={resizing.resizingCol === key}
                      onResizeStart={resizing.handleResizeStart}
                      onReset={resizing.resetColWidth}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleBatches.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <FileSpreadsheet size={34} style={{ margin: '0 auto 0.6rem', opacity: 0.45 }} />
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {loading ? 'Loading Bulk Upload History...' : 'No Bulk Upload History Found'}
                    </div>
                    <div style={{ fontSize: '0.82rem', marginTop: '0.3rem' }}>
                      Jab bhi koi user &quot;Bulk Upload CSV&quot; se file upload karega, uska poora record yahan automatically save hoga.
                    </div>
                  </td>
                </tr>
              ) : (
                visibleBatches.map((batch, idx) => {
                  const rowNum = (safePage - 1) * effectivePageSize + idx + 1;
                  const badge = getStatusBadgeStyle(batch.display_status);
                  return (
                    <tr
                      key={batch.id || batch.batch_ref_code || idx}
                      style={{ background: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary)' }}
                    >
                      <td style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {rowNum}
                      </td>
                      <td style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-light)' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', color: 'var(--accent-color, #2563eb)', background: '#eff6ff', padding: '0.18rem 0.45rem', borderRadius: '4px', border: '1px solid #bfdbfe', display: 'inline-block' }}>
                          {batch.batch_ref_code || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-light)', overflowWrap: 'anywhere' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <FileSpreadsheet size={16} color="#16a34a" style={{ flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }} title={batch.file_name}>
                            {batch.file_name}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.18rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span>{batch.file_type || 'CSV'}</span>
                          <span>•</span>
                          <span>{batch.file_size_label || '—'}</span>
                          {batch.our_company && (
                            <>
                              <span>•</span>
                              <span>{batch.our_company}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-light)', overflowWrap: 'anywhere' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <User size={13} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                          <span>{batch.uploader_name || 'Unknown'}</span>
                        </div>
                        {batch.uploader_email && (
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.12rem' }}>
                            {batch.uploader_email}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-light)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Clock size={13} style={{ flexShrink: 0 }} />
                          <span>{formatISTDateTime(batch.created_at)}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-light)', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {Number(batch.total_records || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-light)' }}>
                        <div style={{ fontWeight: 700, color: '#15803d', fontSize: '0.86rem' }}>
                          {Number(batch.successful_records || 0).toLocaleString()}
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.68rem', padding: '0.08rem 0.35rem', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                            Drafts: {Number(batch.drafts_count || 0)}
                          </span>
                          <span style={{ fontSize: '0.68rem', padding: '0.08rem 0.35rem', borderRadius: '4px', background: '#dcfce7', color: '#166534', fontWeight: 600 }}>
                            Reg: {Number(batch.registered_count || 0)}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-light)' }}>
                        {Number(batch.duplicates_count || 0) > 0 ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.18rem 0.5rem', borderRadius: '999px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
                            {Number(batch.duplicates_count).toLocaleString()} Skipped
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-light)' }}>
                        {Number(batch.failed_records || 0) > 0 ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.18rem 0.5rem', borderRadius: '999px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                            {Number(batch.failed_records).toLocaleString()} Failed
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-light)' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px', background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap' }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-light)' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenBatchDetails(batch)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-surface)',
                            color: 'var(--accent-color, #2563eb)',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <Eye size={13} /> View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <StandardTablePagination
          currentPage={safePage}
          totalRecords={filteredBatches.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
        />
      </div>

      {/* Detailed Batch Audit Modal */}
      {selectedBatch && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bulk Upload Batch Details"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={closeDetailsModal}
        >
          <div
            style={{
              background: 'var(--bg-surface, #ffffff)',
              color: 'var(--text-primary)',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '920px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '1rem 1.35rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', background: 'var(--bg-primary)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.9rem', color: 'var(--accent-color, #2563eb)', background: '#eff6ff', padding: '0.2rem 0.55rem', borderRadius: '5px', border: '1px solid #bfdbfe' }}>
                    {selectedBatch.batch_ref_code || 'Batch'}
                  </span>
                  {(() => {
                    const b = getStatusBadgeStyle(selectedBatch.display_status);
                    return (
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '0.18rem 0.55rem', borderRadius: '999px', background: b.bg, color: b.color, border: `1px solid ${b.border}` }}>
                        {b.label}
                      </span>
                    );
                  })()}
                </div>
                <h4 style={{ margin: '0.45rem 0 0.2rem', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <FileSpreadsheet size={18} color="#16a34a" />
                  <span>{selectedBatch.file_name || 'Bulk Upload File'}</span>
                  {selectedBatch.file_size_label && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      ({selectedBatch.file_size_label})
                    </span>
                  )}
                </h4>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <span>👤 <strong>{selectedBatch.uploader_name || 'Unknown'}</strong> {selectedBatch.uploader_email ? `(${selectedBatch.uploader_email})` : ''}</span>
                  <span>🕒 {formatISTDateTime(selectedBatch.created_at)}</span>
                  {selectedBatch.our_company && <span>🏢 {selectedBatch.our_company}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleExportBatchAuditCsv(selectedBatch)}
                  style={{
                    padding: '0.42rem 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <Download size={14} /> Export Audit CSV
                </button>
                <button
                  type="button"
                  onClick={closeDetailsModal}
                  aria-label="Close details"
                  style={{
                    padding: '0.4rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.15rem 1.35rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {loadingDetails && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Loading full batch audit details...</div>
              )}

              {/* 5 Stat Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.65rem' }}>
                <div style={{ padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Rows in File</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Number(selectedBatch.total_records || 0).toLocaleString()}</div>
                </div>
                <div style={{ padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
                  <div style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600 }}>Imported Total</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d' }}>{Number(selectedBatch.successful_records || 0).toLocaleString()}</div>
                </div>
                <div style={{ padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid #fde68a', background: '#fffbeb' }}>
                  <div style={{ fontSize: '0.72rem', color: '#92400e', fontWeight: 600 }}>Saved as Drafts</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b45309' }}>{Number(selectedBatch.drafts_count || 0).toLocaleString()}</div>
                </div>
                <div style={{ padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid #bfdbfe', background: '#eff6ff' }}>
                  <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 600 }}>Registered Leads</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1d4ed8' }}>{Number(selectedBatch.registered_count || 0).toLocaleString()}</div>
                </div>
                <div style={{ padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2' }}>
                  <div style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: 600 }}>Duplicates / Failed</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b91c1c' }}>
                    {Number(selectedBatch.duplicates_count || 0).toLocaleString()} / {Number(selectedBatch.failed_records || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Created Lead Ref Range Banner */}
              {(selectedBatch.first_lead_ref || (selectedBatch.created_refs_sample || []).length > 0) && (
                <div style={{ padding: '0.65rem 0.9rem', borderRadius: '8px', border: '1px solid #bfdbfe', background: '#eff6ff', fontSize: '0.8rem', color: '#1e3a8a', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={15} color="#2563eb" />
                  <span>
                    Created Lead Reference IDs:{' '}
                    <strong style={{ fontFamily: 'monospace' }}>
                      #{selectedBatch.first_lead_ref || selectedBatch.created_refs_sample[0]}
                    </strong>
                    {selectedBatch.last_lead_ref && selectedBatch.last_lead_ref !== selectedBatch.first_lead_ref && (
                      <>
                        {' '}to{' '}
                        <strong style={{ fontFamily: 'monospace' }}>#{selectedBatch.last_lead_ref}</strong>
                      </>
                    )}
                  </span>
                </div>
              )}

              {/* Sub-tabs inside Detail Modal */}
              <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setDetailTab('duplicates')}
                  style={{
                    padding: '0.45rem 0.9rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    background: detailTab === 'duplicates' ? 'var(--accent-color, #2563eb)' : 'var(--bg-primary)',
                    color: detailTab === 'duplicates' ? '#fff' : 'var(--text-primary)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <AlertTriangle size={14} /> Duplicate Conflicts ({(selectedBatch.duplicates_summary || []).length})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('errors')}
                  style={{
                    padding: '0.45rem 0.9rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    background: detailTab === 'errors' ? 'var(--accent-color, #2563eb)' : 'var(--bg-primary)',
                    color: detailTab === 'errors' ? '#fff' : 'var(--text-primary)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <AlertCircle size={14} /> Errors &amp; Failed Rows ({(selectedBatch.errors_summary || []).length})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('mapping')}
                  style={{
                    padding: '0.45rem 0.9rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    background: detailTab === 'mapping' ? 'var(--accent-color, #2563eb)' : 'var(--bg-primary)',
                    color: detailTab === 'mapping' ? '#fff' : 'var(--text-primary)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <Layers size={14} /> Field Mapping ({Object.keys(selectedBatch.mapping || {}).length})
                </button>
              </div>

              {/* Detail Tab Content */}
              {detailTab === 'duplicates' && (
                (selectedBatch.duplicates_summary || []).length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-primary)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Is upload batch me koi duplicate conflicts record nahi huye.
                  </div>
                ) : (
                  <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 5 }}>
                        <tr>
                          <th style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>Row #</th>
                          <th style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>Business / Client</th>
                          <th style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>Contact / GST</th>
                          <th style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>Category</th>
                          <th style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>Match Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedBatch.duplicates_summary.map((dup, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary)' }}>
                            <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', fontFamily: 'monospace' }}>{dup.row || i + 1}</td>
                            <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', fontWeight: 600 }}>{dup.company || dup.name || '—'}</td>
                            <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>{dup.contact || dup.gst || '—'}</td>
                            <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>
                              <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.4rem', borderRadius: '4px', background: dup.category === 'Already in Report' ? '#fee2e2' : '#fef3c7', color: dup.category === 'Already in Report' ? '#b91c1c' : '#92400e', fontWeight: 700 }}>
                                {dup.category || 'Duplicate'}
                              </span>
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>{dup.reason || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {detailTab === 'errors' && (
                (selectedBatch.errors_summary || []).length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', color: '#166534', fontSize: '0.85rem', fontWeight: 600 }}>
                    ✅ Zero errors — sabhi valid rows bina kisi failure ke process ho gayi.
                  </div>
                ) : (
                  <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 5 }}>
                        <tr>
                          <th style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>Row #</th>
                          <th style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>Business / Client</th>
                          <th style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>Phone</th>
                          <th style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>Error Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedBatch.errors_summary.map((errItem, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : '#fff1f2' }}>
                            <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', fontFamily: 'monospace' }}>{errItem.row ?? '—'}</td>
                            <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', fontWeight: 600 }}>{errItem.company || errItem.name || '—'}</td>
                            <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>{errItem.phone || '—'}</td>
                            <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', color: '#b91c1c' }}>{errItem.error || 'Unknown error'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {detailTab === 'mapping' && (
                Object.keys(selectedBatch.mapping || {}).length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-primary)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Is batch ka column mapping detail available nahi hai.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem', maxHeight: '300px', overflow: 'auto', padding: '0.2rem' }}>
                    {Object.entries(selectedBatch.mapping).map(([crmField, csvHeader]) => (
                      <div key={crmField} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <FileText size={12} /> {crmField}
                        </span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                          ← {csvHeader}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
