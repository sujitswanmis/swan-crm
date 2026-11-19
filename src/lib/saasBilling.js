export const SAAS_TIME_ZONE = 'Asia/Kolkata';
export const SAAS_CYCLE_MONTHS = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 };
export const SAAS_INTERNAL_KEYS = new Set(['SAAS_PRICING_CONFIG', 'TENANT_BILLING_HISTORY', 'TELEPHONY_CONFIG', 'SMTP_SERVER_LIMIT']);

export function saasNumber(value, label, { min = 0, max = 1e9, integer = false } = {}) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') throw new Error(`${label} is required.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${label} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`);
  }
  return parsed;
}

export function saasDateKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date.');
  return new Intl.DateTimeFormat('en-CA', { timeZone: SAAS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function saasEndOfDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error('Choose a valid expiry date.');
  const date = new Date(`${value}T23:59:59.999+05:30`);
  if (Number.isNaN(date.getTime()) || saasDateKey(date) !== value) throw new Error('Choose a valid expiry date.');
  return date;
}

export function saasAddMonths(value, months) {
  const count = saasNumber(months, 'Months', { min: 1, max: 120, integer: true });
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid subscription date.');
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  const day = ist.getUTCDate();
  ist.setUTCDate(1);
  ist.setUTCMonth(ist.getUTCMonth() + count);
  const end = new Date(ist);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  ist.setUTCDate(Math.min(day, end.getUTCDate()));
  return new Date(ist.getTime() - 330 * 60 * 1000);
}

export function calculateSaasPrice({ items, seats, months, discountPercent = 0, dealPrice = null }) {
  const seatCount = saasNumber(seats, 'Seats', { min: 1, max: 100000, integer: true });
  const monthCount = saasNumber(months, 'Months', { min: 1, max: 120, integer: true });
  const discount = saasNumber(discountPercent, 'Discount', { max: 100 });
  const selected = items.filter(p => p.is_active !== false && !SAAS_INTERNAL_KEYS.has(p.process_code));
  const rate = selected.reduce((sum, p) => sum + saasNumber(p.monthly_rate_per_user, 'Module rate'), 0);
  const gross = Math.round(rate * seatCount * monthCount * 100) / 100;
  const discountAmount = Math.round(gross * discount) / 100;
  const amount = dealPrice === null || dealPrice === undefined || dealPrice === ''
    ? Math.round((gross - discountAmount) * 100) / 100 : saasNumber(dealPrice, 'Agreed amount');
  return { rate, gross, discountAmount, amount };
}

export function saasInvoiceAmounts(amount, gstType = 'IGST') {
  const base = Math.round(saasNumber(amount, 'Amount') * 100) / 100;
  if (!['IGST', 'CGST_SGST', 'NON_GST'].includes(gstType)) throw new Error('Choose a valid GST mode.');
  const tax = gstType === 'NON_GST' ? 0 : Math.round(base * 18) / 100;
  return { amount: base, gst_type: gstType, gst_rate: gstType === 'NON_GST' ? 0 : 18, tax_amount: tax, total_payable: Math.round((base + tax) * 100) / 100 };
}

export function saasInvoiceTotals(amount, gstType = 'IGST', savedInvoice = null) {
  const calculated = saasInvoiceAmounts(amount, gstType);
  const tax = savedInvoice?.tax_amount != null ? Number(savedInvoice.tax_amount) : calculated.tax_amount;
  const total = savedInvoice?.total_payable != null ? Number(savedInvoice.total_payable) : calculated.total_payable;
  const cgst = Math.round(tax * 50) / 100;
  return { ...calculated, tax_amount: tax, total_payable: total, cgst, sgst: Math.round((tax - cgst) * 100) / 100 };
}
