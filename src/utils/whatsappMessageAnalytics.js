const IST_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
});

export function getWhatsappMessageDay(row) {
  const value = row?.createdAt || row?.sentAt;
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? IST_DAY.format(date) : '';
}

export function normalizeWhatsappRecipient(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

// A real activity sparkline, using IST hour buckets from the selected records.
// This does not invent a comparison against an unloaded previous period.
export function getWhatsappMessageTrend(input) {
  const unique = new Map();
  (Array.isArray(input) ? input : []).forEach(row => { if (row?.id) unique.set(row.id, row); });
  const hours = new Map();
  for (const row of unique.values()) {
    if (row.status !== 'sent') continue;
    const at = Date.parse(row.sentAt || row.createdAt);
    if (!Number.isFinite(at)) continue;
    const hour = Math.floor((at + 19800000) / 3600000) * 3600000 - 19800000;
    hours.set(hour, (hours.get(hour) || 0) + 1);
  }
  const points = [...hours].sort((a, b) => a[0] - b[0]).slice(-12).map(([hour, count]) => ({ hour, count }));
  return { points, latestHourCount: points[points.length - 1]?.count || 0 };
}

export function filterWhatsappMessageLogs(rows, {
  fromDate = '', toDate = '', branchCode = '', status = 'all', search = '', frequencyFor
} = {}) {
  const needle = String(search || '').trim().toLowerCase();
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (!row?.id || (branchCode && row.branchCode !== branchCode) || (status !== 'all' && row.status !== status)) return false;
    if (fromDate || toDate) {
      const day = getWhatsappMessageDay(row);
      if (!day || (fromDate && day < fromDate) || (toDate && day > toDate)) return false;
    }
    if (!needle) return true;
    return [row.recipient, row.leadName, row.customerCompany, row.templateName, row.campaignName,
      row.tenantCode, row.branchCode, row.branchName, row.error, row.detail, frequencyFor?.(row)]
      .some(value => String(value || '').toLowerCase().includes(needle));
  });
}

function counter() {
  return { attempts: 0, sent: 0, failed: 0, other: 0, customers: new Set(), numbers: new Set(), templates: new Set(), lastMessageAt: '', lastSentAt: '' };
}

function count(group, row, customerKey, templateKey, number) {
  group.attempts++;
  if (row.status === 'sent') {
    group.sent++;
    const sentAt = row.sentAt || row.createdAt;
    if (sentAt && Number.isFinite(Date.parse(sentAt)) && (!group.lastSentAt || Date.parse(sentAt) > Date.parse(group.lastSentAt))) group.lastSentAt = sentAt;
    if (customerKey) group.customers.add(customerKey);
    if (number) group.numbers.add(number);
    if (templateKey) group.templates.add(templateKey);
  } else if (row.status === 'failed') group.failed++;
  else group.other++;
  const at = row.createdAt || row.sentAt;
  if (at && Number.isFinite(Date.parse(at)) && (!group.lastMessageAt || Date.parse(at) > Date.parse(group.lastMessageAt))) group.lastMessageAt = at;
}

function finish(group) {
  const { customers, numbers, templates, ...values } = group;
  return { ...values, uniqueCustomers: customers.size, uniqueNumbers: numbers.size, templatesUsed: templates.size };
}

function addGroup(map, key, properties) {
  if (!map.has(key)) map.set(key, { key, ...properties, ...counter() });
  return map.get(key);
}

// Every aggregation consumes the complete filtered period, never a table page.
// Identity is a CRM lead ID within its tenant. Names/phone numbers do not merge
// different CRM customers; normalized phone reach is reported separately.
function aggregate(input, filters, detailed) {
  const uniqueRows = new Map();
  (Array.isArray(input) ? input : []).forEach(row => { if (row?.id) uniqueRows.set(String(row.id), row); });
  const total = counter();
  const customers = new Map(), templates = new Map(), daily = new Map(), templateDaily = new Map();
  const customerSendCounts = new Map();
  let unattributedSent = 0;
  let undatedAttempts = 0;
  for (const row of filterWhatsappMessageLogs([...uniqueRows.values()], filters)) {
    const customerKey = row.leadId ? JSON.stringify([row.tenantCode || '', row.leadId]) : '';
    const templateKey = row.templateId ? JSON.stringify([row.tenantCode || '', row.templateId]) : '';
    const validTime = Boolean((row.createdAt || row.sentAt) && Number.isFinite(Date.parse(row.createdAt || row.sentAt)));
    const day = detailed && validTime ? getWhatsappMessageDay(row) : '';
    const number = normalizeWhatsappRecipient(row.recipient);
    const templateName = row.templateName || 'Unavailable template';
    count(total, row, customerKey, templateKey, number);
    if (row.status === 'sent' && customerKey) customerSendCounts.set(customerKey, (customerSendCounts.get(customerKey) || 0) + 1);
    if (row.status === 'sent' && !customerKey) unattributedSent++;
    if (!validTime) undatedAttempts++;
    if (!detailed) continue;
    const customer = addGroup(customers, customerKey || 'unlinked', {
      customerName: customerKey ? row.leadName || row.customerCompany || 'Unknown customer' : 'Unlinked customer',
      customerCompany: row.customerCompany || '', recipientNumbers: new Set(), sentTemplateNames: new Set(), identified: Boolean(customerKey)
    });
    count(customer, row, customerKey, templateKey, number);
    if (number) customer.recipientNumbers.add(number);
    if (row.status === 'sent') customer.sentTemplateNames.add(templateName);
    const template = addGroup(templates, templateKey || 'unavailable', { templateName, campaignName: row.campaignName || '' });
    count(template, row, customerKey, templateKey, number);
    if (day) {
      count(addGroup(daily, day, { day }), row, customerKey, templateKey, number);
      count(addGroup(templateDaily, JSON.stringify([day, templateKey]), { day, templateName, campaignName: row.campaignName || '' }), row, customerKey, templateKey, number);
    }
  }
  const customerRows = [...customers.values()].map(group => {
    const { recipientNumbers, sentTemplateNames, ...value } = group;
    return { ...finish(value), recipientNumbers: [...recipientNumbers].sort(), sentTemplateNames: [...sentTemplateNames].sort(), repeat: group.identified && group.sent >= 2 };
  }).sort((a, b) => b.sent - a.sent || b.attempts - a.attempts || a.customerName.localeCompare(b.customerName));
  const summary = {
    ...finish(total),
    repeatCustomers: [...customerSendCounts.values()].filter(sent => sent >= 2).length,
    averageMessagesPerCustomer: total.customers.size ? (total.sent - unattributedSent) / total.customers.size : 0,
    unattributedSent,
    undatedAttempts
  };
  return {
    summary,
    customers: customerRows,
    templates: [...templates.values()].map(finish).sort((a, b) => b.sent - a.sent || b.attempts - a.attempts || a.templateName.localeCompare(b.templateName)),
    daily: [...daily.values()].map(finish).sort((a, b) => a.day.localeCompare(b.day)),
    templateDaily: [...templateDaily.values()].map(finish).sort((a, b) => b.day.localeCompare(a.day) || b.sent - a.sent || a.templateName.localeCompare(b.templateName))
  };
}

export function buildWhatsappMessageAnalytics(input, filters) {
  return aggregate(input, filters, true);
}

export function summarizeWhatsappMessageLogs(input, filters) {
  return aggregate(input, filters, false).summary;
}
