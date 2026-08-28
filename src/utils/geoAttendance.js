// ============================================================================
// SuPuja Creations CRM - GPS Location & Geofencing Utilities
// ============================================================================

/**
 * Gets high-accuracy GPS coordinates from mobile / browser hardware
 */
export function getCurrentGPSLocation() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      resolve({ success: false, error: 'Geolocation is not supported by your browser / device' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
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
        let message = 'Location access denied or unavailable';
        if (error.code === 1) message = 'Please allow Location / GPS permission to punch in';
        if (error.code === 2) message = 'Position unavailable (check GPS settings)';
        if (error.code === 3) message = 'Location request timed out';
        resolve({ success: false, error: message });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
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
