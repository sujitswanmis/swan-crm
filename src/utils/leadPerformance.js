export function isMobileLeadDevice() {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia?.('(max-width: 768px)')?.matches === true ||
      /Android|iPhone|iPad|iPod/i.test(window.navigator?.userAgent || '') ||
      (window.navigator?.platform === 'MacIntel' && window.navigator?.maxTouchPoints > 1);
  } catch (_error) { return false; }
}

export function getLeadRuntimeProfile() {
  return isMobileLeadDevice()
    ? { mobile: true, firstBatch: 48, batchSize: 64, timeBudgetMs: 8, maxPageSize: 100 }
    : { mobile: false, firstBatch: 400, batchSize: 400, timeBudgetMs: Infinity, maxPageSize: Infinity };
}

export function getMobileLeadPage(rows, pagination) {
  const pageSize = Math.max(1, Math.min(100, Number(pagination.pageSize) || 15));
  const pageIndex = Math.max(0, Math.min(Number(pagination.pageIndex) || 0, Math.max(0, Math.ceil(rows.length / pageSize) - 1)));
  return { rows: rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize), pagination: { pageIndex, pageSize } };
}

// Reuse the table's actual accessor/filter functions without allocating a
// TanStack row (and its dozens of methods) for every cached lead.
export function createLeadRowReader(columns) {
  const accessors = new Map(columns.map(column => [column.id || column.accessorKey, column]));
  return (lead, index) => ({ original: lead, getValue: id => {
    const column = accessors.get(id);
    return column?.accessorFn ? column.accessorFn(lead, index) : lead[column?.accessorKey || id];
  } });
}

export async function readLeadCacheInPages(db, storeName, {
  scope, generation, keyRange, onPreview, pageSize = 250,
  yieldTask = () => new Promise(resolve => setTimeout(resolve, 0))
}) {
  const items = [];
  let lastKey;
  let previewSent = false;
  for (;;) {
    const page = await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const timer = setTimeout(() => reject(new Error('IndexedDB page read stalled')), 30000);
      const finish = callback => value => { clearTimeout(timer); callback(value); };
      try {
        const request = tx.objectStore(storeName).getAll(lastKey === undefined ? undefined : keyRange.lowerBound(lastKey, true), pageSize);
        request.onsuccess = finish(() => resolve(request.result || []));
        request.onerror = finish(() => reject(request.error || new Error('IndexedDB page read failed')));
        tx.onabort = finish(() => reject(tx.error || new Error('IndexedDB page read aborted')));
      } catch (error) { clearTimeout(timer); reject(error); }
    });
    if (!page.length) return items;
    const nextKey = page[page.length - 1]?.id;
    if (nextKey === undefined || nextKey === lastKey) throw new Error('IndexedDB pagination did not advance');
    for (const row of page) {
      const candidates = String(row?.id || '').startsWith('__bucket_') ? row.leads || [] : [row];
      for (const lead of candidates) {
        if (lead?.id && !String(lead.id).startsWith('__') && (!scope || lead.__cacheScope === scope) &&
          (!generation || lead.__cacheGeneration === generation)) items.push(lead);
      }
    }
    if (!previewSent && items.length && onPreview) {
      previewSent = true;
      try { onPreview(items.slice(0, 100)); } catch (_error) {}
    }
    if (page.length < pageSize) return items;
    lastKey = nextKey;
    await yieldTask();
  }
}
