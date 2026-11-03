// One Settings page owns these tabs. Existing permission IDs stay compatible.
export const INTEGRATION_TABS = [
  { id: 'integrations', label: 'Overview', description: 'Check connection status and setup readiness for this company and branch.' },
  { id: 'integrations_api', label: 'API Access', features:['api_read','api_write'], description: 'Create scoped API keys to read, receive and update lead data.' },
  { id: 'integrations_connections', label: 'Connections', features:['external_pull','external_push'], description: 'Configure external APIs to pull data or push selected leads.' },
  { id: 'integrations_incoming', label: 'Incoming Webhooks', features:['incoming'], description: 'Receive signed lead notifications from external systems.' },
  { id: 'integrations_outgoing', label: 'Outgoing Webhooks', features:['outgoing'], description: 'Deliver lead events to your authorized external destinations.' },
  { id: 'integrations_meta', label: 'Meta Leads', features:['meta'], description: 'Connect Facebook Pages and Instant Forms to receive Meta leads.' },
  { id: 'integrations_logs', label: 'Logs', description: 'Inspect delivery attempts, queued jobs and connection activity.' },
];
export const INTEGRATION_PAGE = { id: 'integrations', label: 'Integrations & API', subItems: INTEGRATION_TABS };
// Server callers retain their existing tab IDs and authorization contract.
export const INTEGRATION_PAGES = INTEGRATION_TABS.map(tab => ({
  ...tab, label: `${INTEGRATION_PAGE.label} · ${tab.label}`, tabLabel: tab.label, pageId: INTEGRATION_PAGE.id,
}));
export const INTEGRATION_PAGE_IDS = INTEGRATION_TABS.map(tab => tab.id);
export const CONFIG_MASTER_PAGES = [
  {id:'notifications',label:'User Notifications'}, {id:'messages',label:'Platform Messaging & OTPs'},
  {id:'status',label:'System Health & Server Logs'}, {id:'automation',label:'Automation & Webhook API'},
  {id:'tenant_integrations',label:'Tenant API & Integrations'}, {id:'navigation',label:'Page Navigation Rules'},
  {id:'offline_rule',label:'Offline Rules & Sync Policy'}, {id:'public_users',label:'Public User Management'},
];
export const INTEGRATION_FEATURES = [
  {id:'api_read',label:'API Read / GET'}, {id:'api_write',label:'API Create / Update'},
  {id:'incoming',label:'Incoming Webhooks'}, {id:'outgoing',label:'Outgoing Webhooks'},
  {id:'external_pull',label:'External API GET / Pull'}, {id:'external_push',label:'External API Push'},
  {id:'meta',label:'Meta Lead Ads'},
];
export function integrationFeatureForConnection(connection) {
  return connection.type==='external' ? connection.config?.direction==='push'?'external_push':'external_pull' : connection.type;
}
export function resolveIntegrationTab(pathname = '', search = '') {
  const sub = pathname.replace(/^\/+|\/+$/g, '').toLowerCase().split('/')[1];
  if (sub !== INTEGRATION_PAGE.id && INTEGRATION_PAGE_IDS.includes(sub)) return sub;
  const params = new URLSearchParams(search);
  const requested = params.get('integration_tab') || params.get('setting') || params.get('subtab') || params.get('tab');
  return INTEGRATION_PAGE_IDS.includes(requested) ? requested : INTEGRATION_TABS[0].id;
}
export function integrationTabHref(tabId, search = '') {
  const params = new URLSearchParams(search);
  for (const key of ['setting', 'subtab', 'tab']) {
    if (INTEGRATION_PAGE_IDS.includes(params.get(key))) params.delete(key);
  }
  if (INTEGRATION_PAGE_IDS.includes(tabId) && tabId !== INTEGRATION_TABS[0].id) params.set('integration_tab', tabId);
  else params.delete('integration_tab');
  const query = params.toString();
  return `/settings/${INTEGRATION_PAGE.id}${query ? `?${query}` : ''}`;
}
export const API_SCOPES = ['leads:read', 'leads:create', 'leads:update', 'lookups:read'];
export const LEAD_EVENTS = ['lead.created', 'lead.updated', 'lead.stage_changed', 'lead.assigned'];
export const CONNECTION_TYPES = ['external', 'incoming', 'outgoing', 'meta'];
export const LEAD_FIELDS = [
  'name', 'phone', 'email', 'company', 'city_name', 'state_name', 'district_name',
  'address', 'pin_code', 'requirement', 'source', 'source_name', 'priority', 'status', 'assigned_to',
];
export function integrationPageForType(type) {
  return { external: 'integrations_connections', incoming: 'integrations_incoming', outgoing: 'integrations_outgoing', meta: 'integrations_meta' }[type];
}
export function formatIntegrationTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
  }).format(date) + ' IST';
}
export function integrationTimestamp(value) {
  if(!value) return null;
  const date=new Date(value);
  if(!Number.isFinite(date.getTime())) return null;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const part=type=>parts.find(item=>item.type===type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}+05:30`;
}
