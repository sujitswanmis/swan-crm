'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { bulkImportEndCustomers, getEndCustomerTransferContext } from '@/app/actions/endCustomers';
import { downloadEndCustomerFile, parseEndCustomerFile, validateEndCustomerRows, IMPORT_BATCH_SIZE, MAX_IMPORT_ROWS } from '@/utils/endCustomerTransfer';
import useTableColumnResize, { ColumnResizer } from '@/utils/tableColumnResize';

const WIDTHS = { row: 65, status: 110, name: 180, mobile: 145, dealer: 230, product: 220, messages: 320 };
const COLUMNS = [['row', 'File Row'], ['status', 'Status'], ['name', 'Full Name'], ['mobile', 'Mobile 1'], ['dealer', 'Dealer'], ['product', 'Product Model'], ['messages', 'Validation / Result']];
const buttonStyle = { padding: '0.5rem 0.75rem', border: '1px solid var(--border-light)', borderRadius: 7, background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.82rem' };
const stickyStyle = { position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' };

export default function ImportEndCustomersModal({ format, tenantId, customers = [], onClose, onImported }) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const alive = useRef(true);
  const importInFlight = useRef(false);
  const importedCount = useRef(0);
  const { colWidths, resizingCol, handleResizeStart, resetWidth } = useTableColumnResize('end_customer_import_preview_widths', WIDTHS, { row: 60, status: 90, name: 110, mobile: 110, dealer: 110, product: 110, messages: 150 });

  useEffect(() => {
    alive.current = true;
    async function loadContext() {
      try {
        const result = await getEndCustomerTransferContext(tenantId);
        if (!alive.current) return;
        if (!result.success) throw new Error(result.error);
        setContext(result);
      } catch (err) { if (alive.current) setError(err.message || 'Import options could not be loaded.'); }
      finally { if (alive.current) setLoading(false); }
    }
    loadContext();
    return () => { alive.current = false; };
  }, [tenantId]);

  const visibleRows = useMemo(() => rows.filter(row => filter === 'all' || row.status === filter), [rows, filter]);
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const candidates = rows.filter(row => row.status === 'ready' || row.status === 'failed');
  const counts = rows.reduce((result, row) => ({ ...result, [row.status]: (result[row.status] || 0) + 1 }), {});

  const close = () => {
    if (importInFlight.current || busy) return;
    if (importedCount.current) onImported();
    onClose();
  };

  const readFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !context || importing || busy) return;
    setBusy(true); setError(''); setWarning(''); setRows([]); setProgress(null); setPage(1); setFilter('all'); setFileName(file.name);
    try {
      const parsed = await parseEndCustomerFile(file, format);
      if (alive.current) setRows(validateEndCustomerRows(parsed, { ...context, existingCustomers: customers }));
    } catch (err) { if (alive.current) setError(err.message || 'File could not be read.'); }
    finally { if (alive.current) setBusy(false); }
  };

  const downloadTemplate = async () => {
    if (!context || busy || importing) return;
    setBusy(true); setError('');
    try { await downloadEndCustomerFile(format, [], { ...context, template: true }); }
    catch (err) { setError(err.message || 'Template could not be downloaded.'); }
    finally { if (alive.current) setBusy(false); }
  };

  const startImport = async () => {
    if (!candidates.length || !context?.canImport || importInFlight.current || busy) return;
    importInFlight.current = true;
    setImporting(true); setError(''); setWarning(''); setFilter('all'); setPage(1);
    let completed = 0;
    let imported = 0;
    setProgress({ completed, total: candidates.length, imported });
    try {
      for (let offset = 0; offset < candidates.length; offset += IMPORT_BATCH_SIZE) {
        if (!alive.current) break;
        const batch = candidates.slice(offset, offset + IMPORT_BATCH_SIZE);
        let response;
        try {
          response = await bulkImportEndCustomers(batch.map(row => ({ ...row.data, _rowNumber: row.rowNumber })), tenantId);
          if (!response?.success) throw new Error(response?.error || 'Import failed.');
        } catch (err) {
          if (alive.current) {
            const failed = new Set(batch.map(row => row.rowNumber));
            setRows(current => current.map(row => failed.has(row.rowNumber) ? { ...row, status: 'failed', messages: [err.message] } : row));
          }
          throw err;
        }
        imported += response.imported || 0;
        importedCount.current += response.imported || 0;
        completed += batch.length;
        if (!alive.current) break;
        const results = new Map(response.results.map(row => [row.rowNumber, row]));
        setRows(current => current.map(row => results.has(row.rowNumber) ? { ...row, ...results.get(row.rowNumber) } : row));
        if (response.warning) setWarning(response.warning);
        setProgress({ completed, total: candidates.length, imported });
      }
    } catch (err) { if (alive.current) setError(`${err.message} Completed rows are retained. Retry rechecks duplicates.`); }
    finally { importInFlight.current = false; if (alive.current) setImporting(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="end-customer-import-title" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(1180px, 100%)', maxHeight: '94vh', overflow: 'auto', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: 12, padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h2 id="end-customer-import-title" style={{ margin: 0, fontSize: '1.15rem' }}>Import End Customers — {format === 'xlsx' ? 'Excel' : 'CSV'}</h2>
            <p style={{ margin: '0.35rem 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Download the template, fill customer details, then upload and review before importing.</p>
          </div>
          <button type="button" aria-label="Close import" disabled={importing || busy} onClick={close} style={buttonStyle}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
          <button type="button" onClick={downloadTemplate} disabled={loading || busy || importing || !context} style={buttonStyle}><Download size={15} />Download {format === 'xlsx' ? 'Excel' : 'CSV'} Template</button>
          <label style={{ ...buttonStyle, opacity: loading || busy || importing || !context?.canImport ? 0.5 : 1 }}>
            <Upload size={15} />Choose {format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV'} File
            <input aria-label={`Upload ${format === 'xlsx' ? 'Excel' : 'CSV'} file`} type="file" accept={format === 'xlsx' ? '.xlsx' : '.csv'} onChange={readFile} disabled={loading || busy || importing || !context?.canImport} style={{ maxWidth: 230 }} />
          </label>
          {fileName && <span style={{ fontSize: '0.8rem', overflowWrap: 'anywhere' }}>{fileName}</span>}
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Required: Full Name, Mobile 1, Product Model. Maximum {MAX_IMPORT_ROWS} rows / 5 MB. Dealer and product selections must match this workspace. Dates use IST.</p>
        {loading && <p role="status">Loading master lists…</p>}
        {busy && <p role="status">Preparing file…</p>}
        {context && !context.canImport && <p role="alert">You can download templates, but do not have permission to add end customers.</p>}
        {error && <p role="alert" style={{ color: '#ef4444', overflowWrap: 'anywhere' }}>{error}</p>}
        {warning && <p role="status" style={{ color: 'var(--text-secondary)' }}>{warning}</p>}
        {progress && <div aria-live="polite" style={{ marginBottom: '0.75rem' }}>
          <progress value={progress.completed} max={progress.total} style={{ width: '100%' }} />
          <span style={{ fontSize: '0.8rem' }}>Processed {progress.completed} of {progress.total} · Imported {progress.imported}</span>
        </div>}
        {rows.length > 0 && <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
            <span style={{ fontSize: '0.82rem' }}>{rows.length} rows · {counts.ready || 0} ready · {counts.invalid || 0} invalid · {counts.duplicate || 0} duplicate · {counts.imported || 0} imported{counts.failed ? ` · ${counts.failed} failed` : ''}</span>
            <label style={{ fontSize: '0.82rem' }}>Show: <select aria-label="Filter import rows" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
              {['all', 'ready', 'invalid', 'duplicate', 'imported', 'failed'].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
            </select></label>
          </div>
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 430px)', minHeight: 380, border: '1px solid var(--border-light)', borderRadius: 8 }}>
            <table style={{ width: '100%', minWidth: Object.values(colWidths).reduce((sum, width) => sum + width, 0), tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.8rem' }}>
              <thead style={stickyStyle}><tr>{COLUMNS.map(([key, label]) => <th key={key} style={{ ...stickyStyle, width: colWidths[key], padding: '0.65rem' }}>
                {label}<ColumnResizer colKey={key} onResizeStart={handleResizeStart} onReset={resetWidth} isResizing={resizingCol === key} />
              </th>)}</tr></thead>
              <tbody>{pageRows.map(row => <tr key={row.rowNumber}>
                {[row.rowNumber, row.status, row.data.full_name, row.data.mobile_1,
                  [row.data.linked_party_name, row.data.linked_party_code].filter(Boolean).join(' · '), row.data.product_name,
                  row.messages.join('; ') || (row.status === 'imported' ? 'Saved successfully' : 'Ready to import')
                ].map((value, i) => <td key={COLUMNS[i][0]} style={{ padding: '0.65rem', borderBottom: '1px solid var(--border-light)', verticalAlign: 'top', overflowWrap: 'anywhere', color: i === 1 && ['invalid', 'failed'].includes(row.status) ? '#ef4444' : 'inherit' }}>{value}</td>)}
              </tr>)}{!pageRows.length && <tr><td colSpan={COLUMNS.length} style={{ padding: '2rem', textAlign: 'center' }}>No rows match this filter.</td></tr>}</tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem', fontSize: '0.8rem' }}>
            <span>Showing <strong>{visibleRows.length ? (currentPage - 1) * pageSize + 1 : 0}</strong> to <strong>{Math.min(currentPage * pageSize, visibleRows.length)}</strong> of <strong>{visibleRows.length}</strong> records</span>
            <label>Rows per page: <select aria-label="Import rows per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <button type="button" aria-label="First import page" disabled={currentPage === 1} onClick={() => setPage(1)} style={buttonStyle}><ChevronsLeft size={15} /></button>
              <button type="button" aria-label="Previous import page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} style={buttonStyle}><ChevronLeft size={15} /></button>
              <span>Page {currentPage} of {totalPages}</span>
              <button type="button" aria-label="Next import page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)} style={buttonStyle}><ChevronRight size={15} /></button>
              <button type="button" aria-label="Last import page" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)} style={buttonStyle}><ChevronsRight size={15} /></button>
            </div>
          </div>
        </>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '1.25rem' }}>
          <button type="button" onClick={close} disabled={importing || busy} style={buttonStyle}>{importedCount.current ? 'Done' : 'Cancel'}</button>
          <button type="button" onClick={startImport} disabled={loading || busy || importing || !context?.canImport || !candidates.length} style={{ ...buttonStyle, background: '#2563eb', color: '#fff', opacity: loading || busy || importing || !context?.canImport || !candidates.length ? 0.5 : 1 }}>
            {importing ? 'Importing…' : `Import ${candidates.length} Valid Record${candidates.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
