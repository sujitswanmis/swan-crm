// Shared, dependency-free presentation contracts for the composer, server and employee UI.
export const NOTIFICATION_PLACEMENTS = [
  { id: 'top_right', label: 'Top-Right Floating Card', description: 'A compact update below the header.', animation: 'slide_left' },
  { id: 'bottom_right', label: 'Bottom-Right Floating Card', description: 'Quick updates above floating controls.', animation: 'slide_up' },
  { id: 'center_modal', label: 'Center Focus Modal', description: 'A focused dialog with a dimmed backdrop.', animation: 'zoom_in' },
  { id: 'top_banner', label: 'Top Full-Width Banner', description: 'A horizontal announcement below the header.', animation: 'slide_down' },
  { id: 'bottom_banner', label: 'Bottom Sticky Banner', description: 'A reminder along the content’s bottom edge.', animation: 'slide_up' },
  { id: 'right_drawer', label: 'Right-Side Notification Drawer', description: 'Full details and feedback in a side panel.', animation: 'slide_left' },
  { id: 'full_screen', label: 'Full-Screen Critical Alert', description: 'A blocking alert for authorized critical notices.', animation: 'fade_in' }
];
export const NOTIFICATION_SIZES = ['auto', 'compact', 'standard', 'large'];
export const NOTIFICATION_ANIMATIONS = [
  ['none', 'None'], ['fade_in', 'Fade In'], ['slide_down', 'Slide Down'],
  ['slide_up', 'Slide Up'], ['slide_left', 'Slide Left'],
  ['slide_right', 'Slide Right'], ['zoom_in', 'Zoom In']
];
export const NOTIFICATION_ANIMATION_SPEEDS = [[150, 'Fast'], [250, 'Normal'], [400, 'Smooth']];
export const RECOMMENDED_NOTIFICATION_PLACEMENTS = {
  information: 'top_right', important: 'top_banner', urgent: 'center_modal',
  critical: 'full_screen', policy_update: 'center_modal', feedback_request: 'right_drawer'
};
const token = value => String(value || '').trim().toLowerCase();

export function normalizeNotificationPlacement(value) {
  const normalized = token(value);
  return NOTIFICATION_PLACEMENTS.some(p => p.id === normalized) ? normalized : 'top_right';
}

export function normalizeNotificationPresentation(config = {}) {
  const placement = normalizeNotificationPlacement(config.placement_style);
  const animation = token(config.entry_animation);
  return {
    placement_style: placement,
    notification_size: NOTIFICATION_SIZES.includes(token(config.notification_size)) ? token(config.notification_size) : 'auto',
    entry_animation: NOTIFICATION_ANIMATIONS.some(([id]) => id === animation)
      ? animation : NOTIFICATION_PLACEMENTS.find(p => p.id === placement).animation,
    animation_duration: NOTIFICATION_ANIMATION_SPEEDS.some(([ms]) => ms === Number(config.animation_duration)) ? Number(config.animation_duration) : 250
  };
}

export function getNotificationPresentation(notification = {}) {
  const audience = notification.audience && typeof notification.audience === 'object' ? notification.audience : {};
  const config = normalizeNotificationPresentation({ ...notification, ...audience });
  // Historical/malformed data cannot turn an ordinary message into a blocking critical alert.
  if (config.placement_style === 'full_screen' && token(notification.notification_type || audience.notification_type) !== 'critical') {
    return { ...config, placement_style: 'top_right' };
  }
  return config;
}

export function validateNotificationPresentation(config = {}) {
  if (token(config.placement_style) === 'full_screen' && token(config.notification_type) !== 'critical') {
    throw new Error('Full-screen alerts are available only for Critical notifications.');
  }
  return normalizeNotificationPresentation(config);
}

export function resolveNotificationSize(notification = {}) {
  const config = getNotificationPresentation(notification);
  if (config.notification_size !== 'auto') return config.notification_size;
  const audience = notification.audience || {};
  const actions = audience.action_buttons || notification.action_buttons || [];
  const length = String(notification.message || '').length;
  if (length > 900 || actions.length > 3 || ['process', 'spc_feedback_rating'].includes(audience.preset_mode || notification.preset_mode)) return 'large';
  return length <= 180 && actions.length <= 2 ? 'compact' : 'standard';
}

export function requiresNotificationResponse(notification = {}) {
  return ['required', 'acknowledgement_required'].includes(notification.audience?.close_behaviour || notification.close_behaviour);
}

export function prioritizeNotificationQueue(rows = []) {
  const priority = { critical: 5, urgent: 4, important: 3, policy_update: 3, information: 2, feedback_request: 1 };
  const score = row => {
    const notification = row.crm_broadcasts || row;
    return priority[token(notification.notification_type || notification.audience?.notification_type)] || 2;
  };
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (!row || typeof row !== 'object') return false;
    const id = row.broadcast_id || row.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map((row, index) => ({ row, index })).sort((a, b) => score(b.row) - score(a.row) || a.index - b.index).map(({ row }) => row);
}
