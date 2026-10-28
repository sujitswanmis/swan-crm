/**
 * Warranty Calculation Utility strictly in Indian Standard Time (IST, UTC+5:30)
 */

export function calculateWarrantyStatus(purchaseDateStr, warrantyMonths = 12) {
  if (!purchaseDateStr) {
    return {
      status: 'UNKNOWN',
      label: 'Unknown',
      expiryDate: null,
      daysRemaining: 0,
      color: '#94a3b8'
    };
  }

  try {
    const pDate = new Date(purchaseDateStr);
    if (isNaN(pDate.getTime())) {
      return { status: 'UNKNOWN', label: 'Invalid Date', expiryDate: null, daysRemaining: 0, color: '#94a3b8' };
    }

    const months = Number(warrantyMonths) || 12;
    const expiry = new Date(pDate);
    expiry.setMonth(expiry.getMonth() + months);

    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const expiryFormatted = expiry.toISOString().split('T')[0];

    if (diffDays < 0) {
      return {
        status: 'EXPIRED',
        label: 'Expired',
        expiryDate: expiryFormatted,
        daysRemaining: 0,
        color: '#ef4444'
      };
    } else if (diffDays <= 30) {
      return {
        status: 'EXPIRING_SOON',
        label: `Expiring Soon (${diffDays}d left)`,
        expiryDate: expiryFormatted,
        daysRemaining: diffDays,
        color: '#f59e0b'
      };
    } else {
      return {
        status: 'ACTIVE',
        label: `Active (${diffDays}d left)`,
        expiryDate: expiryFormatted,
        daysRemaining: diffDays,
        color: '#10b981'
      };
    }
  } catch {
    return { status: 'UNKNOWN', label: 'Unknown', expiryDate: null, daysRemaining: 0, color: '#94a3b8' };
  }
}
