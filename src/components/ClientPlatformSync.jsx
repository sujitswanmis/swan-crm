'use client';

import { useEffect } from 'react';
import {
  detectClientPlatform,
  CLIENT_PLATFORM_COOKIE,
  CLIENT_PLATFORM_DETAILS_COOKIE
} from '@/utils/platformDetection';

/**
 * Syncs runtime client platform (Web App / Windows App / Android App / iOS App)
 * to first-party cookies so Next.js Server Actions receive accurate platform context.
 */
export default function ClientPlatformSync() {
  useEffect(() => {
    try {
      const { platform, details } = detectClientPlatform();
      const secureFlag = window.location?.protocol === 'https:' ? '; Secure' : '';
      const cookieOpts = `; path=/; max-age=86400; SameSite=Lax${secureFlag}`;

      document.cookie = `${CLIENT_PLATFORM_COOKIE}=${encodeURIComponent(platform)}${cookieOpts}`;
      if (details) {
        document.cookie = `${CLIENT_PLATFORM_DETAILS_COOKIE}=${encodeURIComponent(details)}${cookieOpts}`;
      }
    } catch (_err) {
      // Non-blocking: server falls back to User-Agent headers
    }
  }, []);

  return null;
}
