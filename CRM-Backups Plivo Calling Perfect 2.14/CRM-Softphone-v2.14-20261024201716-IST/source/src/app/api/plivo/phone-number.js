// CRM outbound calls include mobile and landline numbers. This checks dialable
// Indian format; only the carrier can establish whether a
// correctly formatted number is allocated or reachable.
export function normalizeIndianPhoneNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const input = String(value).trim();
  if (!/^\+?[\d\s().-]+$/.test(input)) return null;
  const digits = input.replace(/\D/g, '');
  const national = digits.length === 10 ? digits
    : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
    : digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
    : null;
  return national && /^[2-9]\d{9}$/.test(national) ? `+91${national}` : null;
}
