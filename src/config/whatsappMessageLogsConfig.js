export const WHATSAPP_LOG_PAGE_ID = 'sent_logs';
export const WHATSAPP_LOG_TABS = [
  { id: 'sent_logs_raw', label: 'Detailed Raw Logs' },
  { id: 'sent_logs_customers', label: 'Customer Frequency Activity' },
  { id: 'sent_logs_breakdown', label: 'Template & Daily Breakdown' }
];
export const WHATSAPP_LOG_VIEW_IDS = WHATSAPP_LOG_TABS.map(tab => tab.id);
export const WHATSAPP_LOG_PAGE = { id: WHATSAPP_LOG_PAGE_ID, label: 'API Message Sent Logs', subItems: WHATSAPP_LOG_TABS };
export const WHATSAPP_LOG_PERMISSION_ITEMS = WHATSAPP_LOG_TABS.map(tab => ({
  ...tab, label: `${WHATSAPP_LOG_PAGE.label} · ${tab.label}`, tabLabel: tab.label, pageId: WHATSAPP_LOG_PAGE_ID
}));
