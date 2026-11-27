/**
 * Central Web-Driven Device Permission Registry
 *
 * Add any new CRM module here with its required device permissions.
 * Because Capacitor loads the live CRM URL, adding an entry here immediately enables
 * an on-demand modal permission prompt for mobile/APK users without needing an APK upgrade.
 *
 * Supported permission keys:
 *  - 'camera'
 *  - 'microphone'
 *  - 'location'
 *  - 'background_location'
 *  - 'notifications'
 *  - 'storage_media'
 *  - 'battery_unrestricted'
 *  - 'phone_call'
 *  - 'bluetooth'
 */

export const PERMISSION_DESCRIPTORS = {
  camera: {
    key: 'camera',
    label: 'Camera',
    icon: '📸',
    shortDesc: 'Photo capture, bill/document upload ya QR/KYC scan ke liye'
  },
  microphone: {
    key: 'microphone',
    label: 'Microphone',
    icon: '🎙️',
    shortDesc: 'Voice calling, audio notes aur speech features ke liye'
  },
  location: {
    key: 'location',
    label: 'Location (GPS)',
    icon: '📍',
    shortDesc: 'Attendance punch, client visit check-in aur location verification ke liye'
  },
  background_location: {
    key: 'background_location',
    label: 'Background Location (Allow all the time)',
    icon: '🛰️',
    shortDesc: 'Field duty ke dauran screen lock hone par bhi live route tracking ke liye'
  },
  notifications: {
    key: 'notifications',
    label: 'Notifications',
    icon: '🔔',
    shortDesc: 'Tasks, leads, interviews aur shift reminders ke instant alerts ke liye'
  },
  storage_media: {
    key: 'storage_media',
    label: 'Photos & Media',
    icon: '🖼️',
    shortDesc: 'Gallery se photos, receipts ya documents attach karne ke liye'
  },
  battery_unrestricted: {
    key: 'battery_unrestricted',
    label: 'Battery Unrestricted',
    icon: '🔋',
    shortDesc: 'Phone ke Battery Saver ko background sync rokne se bachane ke liye'
  },
  phone_call: {
    key: 'phone_call',
    label: 'Phone Call',
    icon: '📞',
    shortDesc: 'App ke andar se direct customer calls initiate karne ke liye'
  },
  bluetooth: {
    key: 'bluetooth',
    label: 'Bluetooth',
    icon: '📶',
    shortDesc: 'Thermal printer ya wireless scanner connect karne ke liye'
  }
};

/**
 * Module-to-Permission rules.
 * `mandatory: false` means user gets an "Abhi Nahi" option and won't be harassed repeatedly.
 * `nativeAppOnly: true` skips prompting on desktop browsers/PCs.
 */
export const MODULE_DEVICE_PERMISSIONS = {
  callcenter: {
    moduleId: 'callcenter',
    title: 'Calling & Voice Permission',
    subtitle: 'CRM Call Center par clear voice calling aur call alerts ke liye permission allow karein.',
    permissions: ['microphone', 'notifications'],
    mandatory: false,
    nativeAppOnly: false
  },
  aicallcenter: {
    moduleId: 'aicallcenter',
    title: 'AI Calling Audio Permission',
    subtitle: 'AI Call Center audio playback aur microphone features ke liye permission allow karein.',
    permissions: ['microphone'],
    mandatory: false,
    nativeAppOnly: false
  },
  attendance: {
    moduleId: 'attendance',
    title: 'Attendance Location & Alerts Permission',
    subtitle: 'Sahi GPS location ke sath punch-in/punch-out aur shift reminder alerts ke liye allow karein.',
    permissions: ['location', 'notifications'],
    mandatory: false,
    nativeAppOnly: true
  },
  field_force: {
    moduleId: 'field_force',
    title: 'Field Force Camera, GPS & Battery Permission',
    subtitle: 'Field visits par photo proof, live GPS aur bina ruke background sync ke liye permissions allow karein.',
    permissions: ['location', 'camera', 'notifications', 'battery_unrestricted'],
    mandatory: false,
    nativeAppOnly: true
  }
};

export function resolveModulePermissionConfig(moduleId) {
  if (!moduleId || typeof moduleId !== 'string') return null;
  const normalized = moduleId.trim().toLowerCase();
  if (MODULE_DEVICE_PERMISSIONS[normalized]) {
    return MODULE_DEVICE_PERMISSIONS[normalized];
  }
  return null;
}
