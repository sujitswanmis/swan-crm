// ============================================================================
// SuPuja Creations CRM - GPS Location & Geofencing Utilities
// ============================================================================

/**
 * Gets GPS coordinates from mobile / browser hardware
 * Defaults to enableHighAccuracy: false and 5-min maximumAge for lightning-fast (10-50ms) web response
 */
export function getCurrentGPSLocation(options = {}) {
  // Allow caller's requested timeout (default 5000ms, max 10000ms) for reliable indoor satellite acquisition
  const requestedTimeout = typeof options.timeout === 'number' ? options.timeout : 5000;
  const timeoutMs = Math.min(Math.max(requestedTimeout, 500), 10000);
  const enableHighAccuracy = options.enableHighAccuracy === true;
  const maximumAge = options.maximumAge !== undefined ? options.maximumAge : 300000; // 5 minutes cache for 0ms instant hits

  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      resolve({
        success: false,
        error: 'Geolocation is not supported by your browser / device',
        errorCode: -1,
        isPermissionDenied: false
      });
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({
          success: false,
          error: 'Location request timed out (fast fallback)',
          errorCode: 3,
          isTimeout: true,
          isPermissionDenied: false
        });
      }
    }, timeoutMs);

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const { latitude, longitude, accuracy } = position.coords;
          resolve({
            success: true,
            latitude,
            longitude,
            accuracy: Math.round(accuracy), // in meters
            mapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
            timestamp: position.timestamp || Date.now()
          });
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          let message = 'Location access denied or unavailable';
          if (error.code === 1) message = 'Please allow Location / GPS permission to punch in';
          if (error.code === 2) message = 'Position unavailable (check GPS settings)';
          if (error.code === 3) message = 'Location request timed out';
          resolve({
            success: false,
            error: message,
            errorCode: error.code,
            isPermissionDenied: error.code === 1,
            isPositionUnavailable: error.code === 2,
            isTimeout: error.code === 3
          });
        },
        {
          enableHighAccuracy,
          timeout: timeoutMs,
          maximumAge
        }
      );
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        success: false,
        error: err?.message || 'Geolocation invocation failed',
        errorCode: -2,
        isPermissionDenied: false
      });
    }
  });
}

/**
 * Calculates distance in meters between two GPS coordinates (Haversine Formula)
 */
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // Distance in meters
}
