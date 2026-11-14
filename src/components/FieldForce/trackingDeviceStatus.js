const FRESH_MS = 90000;
const clock = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
const tones = {
  healthy: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  warning: { color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  critical: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  muted: { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
};
function timestamp(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
const fresh = (ms, now) => ms != null && now - ms >= -30000 && now - ms <= FRESH_MS;
const state = (code, label, tone, detail = '') => ({ code, label, tone, detail, ...tones[tone], isOff: tone === 'critical' || tone === 'warning' });

// Field Force presentation only. GPS absence is never evidence that internet
// was switched off, and an old permission report is never a current diagnosis.
export function deriveTrackingDeviceStatus(base, route, health, nowMs = Date.now()) {
  if (!base?.isToday || base.isShiftCompleted) return base;
  const mobileHealth = /Android|iOS|iPhone|iPad|Mobile/i.test(`${health?.platform || ''} ${health?.platformDetails || ''}`);
  const healthMs = mobileHealth ? timestamp(health?.lastCheckedAt) : null;
  const healthFresh = fresh(healthMs, nowMs);
  const sessionMs = timestamp(route?.mobileSessionLastActive);
  const pingMs = base.lastPingMs;
  const livePing = !route?.lastPing?.is_offline_synced && fresh(pingMs, nowMs);
  const connected = healthFresh || fresh(sessionMs, nowMs) || livePing;
  const lastContact = Math.max(healthMs || 0, sessionMs || 0) || null;
  const network = connected ? state('ONLINE', 'Online', 'healthy', 'Recent mobile heartbeat received independently of GPS')
    : state('UNKNOWN', 'Connection unconfirmed', 'muted', lastContact ? `Last mobile heartbeat: ${clock.format(new Date(lastContact))} IST` : 'No recent mobile heartbeat');
  let gps;
  if (healthFresh && (health.hasForegroundLocation === false || health.locationMode === 'denied')) {
    gps = state('PERMISSION_DENIED', 'Location permission denied', 'critical');
  } else if (healthFresh && health.gpsProviderEnabled === false) {
    gps = state('PROVIDER_DISABLED', 'Device GPS OFF', 'warning');
  } else if (healthFresh && (health.locationMode === 'while_using' || (health.hasForegroundLocation === true && health.hasBackgroundLocation === false))) {
    gps = state('BACKGROUND_RESTRICTED', 'Background location restricted', 'warning');
  } else if (livePing) {
    gps = state('ACTIVE', 'GPS active', 'healthy', 'Recent location fix received');
  } else if (healthFresh) {
    gps = state('NO_FIX', health.gpsProviderEnabled === true ? 'GPS ON · waiting for location' : 'GPS signal unavailable', 'warning');
  } else {
    gps = state('UNKNOWN', 'GPS status unconfirmed', 'muted');
  }
  if (healthFresh && !gps.detail) gps.detail = `Reported ${clock.format(new Date(healthMs))} IST`;
  return { ...base, independentTelemetry: true, mobileDataState: network, gpsStatusState: gps,
    headerBadge: { label: gps.label, color: gps.color, dot: gps.color } };
}
