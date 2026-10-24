import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import plivo from 'plivo';
import { getWorkspaceTelephonyConfig, getCompanySlug, SWAN_COMPANIES } from '@/utils/telephonyConfig';
import { getPlivoWebhookBaseUrl, isPrivateOrLocalHost } from '@/app/api/plivo/utils';
import { normalizeIndianPhoneNumber } from '@/app/api/plivo/phone-number';

const TABLE = 'call_incoming_routing';
const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const BUSY = ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected'];
const now = () => new Date().toISOString(); // Instant; UI dates remain Asia/Kolkata.
const lower = value => String(value || '').trim().toLowerCase();
const dbClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
export const incomingEmptyXml = '<?xml version="1.0" encoding="UTF-8"?><Response/>';
export const incomingHangupXml = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export class IncomingRoutingError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}
function checked(result) {
  if (result.error) throw new IncomingRoutingError('Incoming routing is temporarily unavailable. The call has not been changed.', 503);
  return result.data;
}
const load = async (db, id) => checked(await db.from(TABLE).select('*').eq('id', id).maybeSingle());
async function patch(ctx, row, changes, status = row.status) {
  return checked(await ctx.db.from(TABLE).update({ ...changes, revision: row.revision + 1, updated_at: now() })
    .eq('id', row.id).eq('revision', row.revision).eq('status', status).select('*').maybeSingle());
}

async function scopeFor(db, role) {
  const tenantId = role.tenant_id || role.module_access?._tenantId || null;
  const company = String(role.company || '').trim();
  const swan = (!tenantId || tenantId === DEFAULT_TENANT) && (SWAN_COMPANIES.includes(lower(company)) ||
    (!company && (tenantId === DEFAULT_TENANT || [role.email, role.emp_official_mail_id].some(email => lower(email).endsWith('@newswangroup.com')))));
  if (swan) return { key: 'swan', company, tenantId: DEFAULT_TENANT, companies: SWAN_COMPANIES, swan: true };
  if (tenantId && tenantId !== DEFAULT_TENANT) {
    const tenant = checked(await db.from('tenants').select('id,name,tenant_code').eq('id', tenantId).maybeSingle());
    if (!tenant) throw new IncomingRoutingError('Workspace unavailable.', 403);
    return { key: `tenant:${tenantId}`, company: tenant.name, tenantId, companies: [lower(tenant.name), lower(tenant.tenant_code)], swan: false };
  }
  if (!company || SWAN_COMPANIES.includes(lower(company))) throw new IncomingRoutingError('Workspace unavailable.', 403);
  const tenants = checked(await db.from('tenants').select('id,name,tenant_code').ilike('name', company).limit(2));
  if (tenants?.length === 1) return { key: `tenant:${tenants[0].id}`, company: tenants[0].name, tenantId: tenants[0].id,
    companies: [lower(tenants[0].name), lower(tenants[0].tenant_code)], swan: false };
  return { key: `company:${lower(company)}`, company, tenantId: null, companies: [lower(company)], swan: false };
}
function belongs(role, scope) {
  const tenant = role?.tenant_id || role?.module_access?._tenantId;
  if (tenant && tenant !== DEFAULT_TENANT) return tenant === scope.tenantId;
  if (scope.swan) return !lower(role?.company) || SWAN_COMPANIES.includes(lower(role?.company));
  return !tenant && scope.companies.includes(lower(role?.company));
}
async function credentials(db, row) {
  const config = await getWorkspaceTelephonyConfig(row.company, row.tenant_id);
  if (!config.authId || !config.authToken || (row.account_id && config.authId !== row.account_id)) {
    throw new IncomingRoutingError('Calling account cannot be verified.', 503);
  }
  return { db, config, client: new plivo.Client(config.authId, config.authToken, { timeout: 8000 }) };
}
function sign(ctx, row, kind, extra = {}) {
  const data = Buffer.from(JSON.stringify({ id: row.id, k: kind, g: row.invite_revision,
    b: ctx.publicBaseUrl || '',
    // Invites expire quickly. Completion callbacks must survive a long,
    // connected call; the row still enforces its own active/expired state.
    e: kind === 'invite' ? Math.min(Date.parse(row.expires_at), Date.now() + 120000) : Date.now() + 5 * 3600000, ...extra })).toString('base64url');
  return `${data}.${createHmac('sha256', ctx.config.authToken).update(data).digest('base64url')}`;
}
function decode(token) {
  try {
    if (typeof token !== 'string' || token.length > 1400) throw new Error();
    const [data, signature, excess] = token.split('.');
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (excess || !signature || !UUID.test(payload.id) || !Number.isInteger(payload.g) || !Number.isFinite(payload.e)) throw new Error();
    return { payload, data, signature };
  } catch { throw new IncomingRoutingError('Invalid incoming invitation.', 403); }
}
async function signedContext(token, kind) {
  const parsed = decode(token), db = dbClient(), row = await load(db, parsed.payload.id);
  if (!row) throw new IncomingRoutingError('Incoming call not found.', 404);
  const ctx = await credentials(db, row);
  const expected = createHmac('sha256', ctx.config.authToken).update(parsed.data).digest();
  const supplied = Buffer.from(parsed.signature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || parsed.payload.k !== kind ||
      parsed.payload.e < Date.now() || Date.parse(row.expires_at) < Date.now()) throw new IncomingRoutingError('Incoming invitation expired or invalid.', 403);
  if (parsed.payload.b && (!parsed.payload.b.startsWith('https://') || isPrivateOrLocalHost(new URL(parsed.payload.b).host))) throw new IncomingRoutingError('Invalid public callback URL.', 403);
  return { ...ctx, row, payload: parsed.payload, publicBaseUrl: parsed.payload.b || '' };
}
function callbackUrl(req, ctx, row, kind, extra = {}) {
  const route = ['notice', 'fallback'].includes(kind) ? 'incoming-fallback' : 'incoming-route';
  const query = new URLSearchParams({ mode: kind, token: sign(ctx, row, kind, extra) });
  return `${ctx.publicBaseUrl || getPlivoWebhookBaseUrl(req)}/api/plivo/${route}?${query}`;
}
function eventMatches(row, event) {
  return (event.DialALegUUID || event.CallUUID) === row.parent_call_uuid;
}

async function availableAgents(ctx, row, currentId = null) {
  const ids = row.eligible_agent_ids.filter(id => id !== currentId && !row.visited_agent_ids.includes(id));
  if (!ids.length) return [];
  const agents = checked(await ctx.db.from('call_agents').select('*').in('id', ids).eq('is_active', true));
  const roles = checked(await ctx.db.from('user_roles').select('*').in('user_id', agents.map(agent => agent.user_id)));
  const scope = { key: row.workspace_key, tenantId: row.tenant_id, swan: row.workspace_key === 'swan', companies: [lower(row.company)] };
  if (!scope.swan && scope.tenantId) {
    const tenant = checked(await ctx.db.from('tenants').select('name,tenant_code').eq('id', scope.tenantId).maybeSingle());
    scope.companies.push(lower(tenant?.name), lower(tenant?.tenant_code));
  }
  const busy = checked(await ctx.db.from('call_sessions').select('agent_id').in('agent_id', ids).in('status', BUSY));
  const occupied = new Set((busy || []).map(call => call.agent_id));
  const otherInvites = checked(await ctx.db.from(TABLE).select('id,ringing_agent_ids,expires_at').eq('workspace_key', row.workspace_key)
    .in('status', ['ringing', 'routing', 'connected']).neq('id', row.id).limit(500));
  for (const invite of otherInvites || []) if (Date.parse(invite.expires_at) > Date.now()) invite.ringing_agent_ids.forEach(id => occupied.add(id));
  return (agents || []).filter(agent => agent.user_id && agent.plivo_sip_uri && agent.status === 'available' && !occupied.has(agent.id) &&
    roles.some(role => role.user_id === agent.user_id && belongs(role, scope)))
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}
async function forwardNumber(ctx, row) {
  let number = '';
  if (row.tenant_id && row.tenant_id !== DEFAULT_TENANT) {
    const ent = checked(await ctx.db.from('tenant_entitlements').select('config_json').eq('tenant_id', row.tenant_id).eq('module_key', 'TELEPHONY_CONFIG').maybeSingle());
    number = ent?.config_json?.default_forward || '';
  }
  const key = row.workspace_key === 'swan' ? 'system_settings_forward' : `system_settings_forward_${getCompanySlug(row.company)}`;
  const setting = checked(await ctx.db.from('call_agents').select('mobile_number').eq('plivo_username', key).maybeSingle());
  number = number || setting?.mobile_number || (row.workspace_key === 'swan' ? process.env.DEFAULT_FORWARD_TO : '');
  const normalized = normalizeIndianPhoneNumber(String(number || '').replace(/['"]/g, '').trim());
  // A fallback cannot call the caller or loop back into this incoming number.
  return normalized && normalized !== normalizeIndianPhoneNumber(row.customer_number) && normalized !== normalizeIndianPhoneNumber(row.destination_number) ? normalized : null;
}

// Optional metadata only: missing migration or a failed read retains the
// previously working incoming XML. Existing inbound selection is unchanged.
export async function prepareIncomingRouting(db, event, targets, allowedIds = [], req = null) {
  if (!UUID.test(event.CallUUID || '') || !targets.length) return null;
  try {
    const agents = checked(await db.from('call_agents').select('*').eq('is_active', true).limit(1000));
    const roles = checked(await db.from('user_roles').select('*').in('user_id', agents.map(agent => agent.user_id).filter(Boolean)));
    const first = agents.find(agent => agent.id === targets[0].id);
    const firstRole = roles.find(role => role.user_id === first?.user_id);
    if (!firstRole) return null;
    const scope = await scopeFor(db, firstRole);
    if (targets.some(target => !roles.some(role => role.user_id === agents.find(agent => agent.id === target.id)?.user_id && belongs(role, scope)))) return null;
    const ctx = await credentials(db, { company: scope.company, tenant_id: scope.tenantId });
    if (req) {
      const nonce = req.headers.get('x-plivo-signature-v3-nonce');
      const signature = req.headers.get('x-plivo-signature-v3');
      const parsed = new URL(req.url);
      const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
      const candidates = [req.url, `${getPlivoWebhookBaseUrl(req)}${parsed.pathname}${parsed.search}`,
        host ? `https://${host}${parsed.pathname}${parsed.search}` : ''].filter(Boolean);
      const verified = nonce && signature && candidates.find(uri => plivo.validateV3Signature('POST', uri, nonce, ctx.config.authToken, signature, event));
      if (!verified || !verified.startsWith('https://') || isPrivateOrLocalHost(new URL(verified).host)) return null;
      // Preserve the verified public inbound host (including an active dev
      // tunnel) in signed capabilities, rather than sending Plivo to localhost
      // or a different deployment when the agent clicks from a local CRM tab.
      ctx.publicBaseUrl = new URL(verified).origin;
    }
    if (event.AuthId && event.AuthId !== ctx.config.authId) return null;
    // The current incoming webhook uses the platform account. Do not attach a
    // different tenant's account credentials to that existing Dial operation.
    const inboundAccount = String(process.env.PLIVO_AUTH_ID || '').replace(/['"]/g, '').trim();
    if (inboundAccount && ctx.config.authId !== inboundAccount) return null;
    const eligible = agents.filter(agent => agent.user_id && agent.plivo_sip_uri && (!allowedIds.length || allowedIds.includes(agent.id)) &&
      roles.some(role => role.user_id === agent.user_id && belongs(role, scope))).map(agent => agent.id);
    const row = {
      id: randomUUID(), parent_call_uuid: event.CallUUID, workspace_key: scope.key, company: scope.company,
      tenant_id: scope.tenantId, account_id: ctx.config.authId, customer_number: event.From || '', destination_number: event.To || '',
      eligible_agent_ids: [...new Set([...eligible, ...targets.map(agent => agent.id)])], ringing_agent_ids: targets.map(agent => agent.id),
      visited_agent_ids: [], status: 'ringing', action: null, revision: 0, invite_revision: 0,
      expires_at: new Date(Date.now() + 15 * 60000).toISOString()
    };
    const result = await db.from(TABLE).insert(row).select('*').maybeSingle();
    if (result.error?.code === '23505') {
      const existing = checked(await db.from(TABLE).select('*').eq('parent_call_uuid', event.CallUUID).maybeSingle());
      if (!existing || existing.status !== 'ringing' || existing.invite_revision !== 0 || existing.workspace_key !== row.workspace_key) return null;
      return { ctx, row: existing };
    }
    return { ctx, row: checked(result) };
  } catch (error) {
    console.warn('[Incoming routing] Optional routing controls unavailable:', error.status || error.code || 'read failed');
    return null;
  }
}

export function incomingAgentDialXml(req, ctx, row, agents, legacyHeaders = '') {
  const users = agents.map(agent => {
    const token = sign(ctx, row, 'invite', { a: agent.id });
    // The browser SDK drops custom header values longer than 120 characters.
    // Preserve the signed capability in numbered, bounded transport chunks.
    const parts = token.match(/.{1,100}/g);
    const routingHeader = [`CrmInboundParts=${parts.length}`,
      ...parts.map((part, index) => `CrmInbound${index + 1}=${part}`)].join(',');
    const combined = `${legacyHeaders ? `${legacyHeaders},` : ''}${routingHeader}`;
    const headers = Buffer.byteLength(combined, 'utf8') <= 480 ? combined : routingHeader;
    return `<User sipHeaders="${escapeXml(headers)}">${escapeXml(agent.plivo_sip_uri)}</User>`;
  }).join('');
  const notice = callbackUrl(req, ctx, row, 'notice'), fallback = callbackUrl(req, ctx, row, 'fallback');
  const events = callbackUrl(req, ctx, row, 'event');
  // Notification responses cannot interfere with the new XML after a manual
  // parent-leg transfer. Natural completion continues to the signed fallback.
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${escapeXml(row.customer_number)}" timeout="25" redirect="false" action="${escapeXml(notice)}" method="POST" callbackUrl="${escapeXml(events)}" callbackMethod="POST">${users}</Dial><Redirect method="POST">${escapeXml(fallback)}</Redirect></Response>`;
}

async function controlContext(userId, token) {
  if (!userId) throw new IncomingRoutingError('Please sign in again.', 401);
  const ctx = await signedContext(token, 'invite');
  const [agentResult, roleResult] = await Promise.all([
    ctx.db.from('call_agents').select('*').eq('id', ctx.payload.a).eq('user_id', userId).eq('is_active', true).maybeSingle(),
    ctx.db.from('user_roles').select('*').eq('user_id', userId).maybeSingle()
  ]);
  const agent = checked(agentResult);
  if (!agent || !ctx.row.eligible_agent_ids.includes(agent.id)) throw new IncomingRoutingError('This invitation belongs to another agent.', 403);
  const role = checked(roleResult);
  if (!role || (await scopeFor(ctx.db, role)).key !== ctx.row.workspace_key) throw new IncomingRoutingError('This call belongs to another workspace.', 403);
  return { ...ctx, agent, userId };
}
function assertRinging(ctx) {
  if (ctx.row.status !== 'ringing' || ctx.payload.g !== ctx.row.invite_revision || !ctx.row.ringing_agent_ids.includes(ctx.agent.id)) {
    throw new IncomingRoutingError('This incoming call is no longer available.');
  }
}
async function assertLiveInvitation(ctx, inviteUuid) {
  if (!UUID.test(inviteUuid || '')) throw new IncomingRoutingError('Invalid incoming call reference.', 400);
  const [live, parent] = await Promise.all([
    ctx.client.calls.getLiveCall(inviteUuid), ctx.client.calls.getLiveCall(ctx.row.parent_call_uuid)
  ]);
  const target = lower(live.to || live.toNumber).replace(/^sip:/, '').split('@')[0];
  const state = lower(live.callStatus || live.call_state || live.callState);
  if (!['ringing', 'queued'].includes(state) || target !== lower(ctx.agent.plivo_username)) throw new IncomingRoutingError('The invitation has ended or was already answered.');
  if (lower(parent.direction) !== 'inbound' || normalizeIndianPhoneNumber(parent.from) !== normalizeIndianPhoneNumber(ctx.row.customer_number) ||
      normalizeIndianPhoneNumber(parent.to) !== normalizeIndianPhoneNumber(ctx.row.destination_number)) throw new IncomingRoutingError('Incoming customer leg could not be verified.', 403);
}
function resultFor(row) {
  return { success: ['declined', 'forwarded'].includes(row.status) || (row.action === 'next' && row.status === 'ringing'),
    pending: row.status === 'routing', action: row.action, status: row.status,
    message: row.action === 'decline' ? 'Call Declined' : row.action === 'next' ? 'Call sent to next agent' : 'Call forwarded to default number' };
}

export async function controlIncomingCall(req, userId, body) {
  const ctx = await controlContext(userId, body.token), row = ctx.row;
  if (body.action === 'status') {
    if (!UUID.test(body.operationId || '') || row.operation_id !== body.operationId || row.requested_by !== userId) throw new IncomingRoutingError('Action not found.', 404);
    return resultFor(row);
  }
  if (body.operationId && row.operation_id === body.operationId && row.requested_by === userId && row.action === body.action) return resultFor(row);
  assertRinging(ctx);
  if (body.action === 'options') {
    const [next, forward] = await Promise.all([availableAgents(ctx, row, ctx.agent.id), forwardNumber(ctx, row)]);
    return { canNext: next.length > 0, canForward: !!forward, canDecline: true };
  }
  if (!['forward', 'next', 'decline'].includes(body.action) || !UUID.test(body.operationId || '')) throw new IncomingRoutingError('Invalid incoming action.', 400);
  const [, nextAgents, forward] = await Promise.all([
    assertLiveInvitation(ctx, body.inviteUuid),
    body.action === 'next' ? availableAgents(ctx, row, ctx.agent.id) : null,
    body.action === 'forward' ? forwardNumber(ctx, row) : null
  ]);
  const next = nextAgents?.[0] || null;
  if (body.action === 'next' && !next) throw new IncomingRoutingError('No other agent is available. The call is still ringing.');
  if (body.action === 'forward' && !forward) throw new IncomingRoutingError('No default forwarding number is available. The call is still ringing.');
  const claimed = await patch(ctx, row, { status: 'routing', action: body.action, operation_id: body.operationId,
    requested_by: userId, next_agent_id: next?.id || null });
  if (!claimed) throw new IncomingRoutingError('Another agent or action already handled this invitation.');
  try {
    // A second provider read after claiming closes the normal Answer/Cancel
    // race without ever mutating a call selected by caller-supplied parent ID.
    await assertLiveInvitation(ctx, body.inviteUuid);
    if (body.action === 'decline') {
      await ctx.client.calls.hangup(row.parent_call_uuid);
      const ended = await patch(ctx, claimed, { status: 'declined' });
      return resultFor(ended || { ...claimed, status: 'declined' });
    }
    const url = callbackUrl(req, ctx, claimed, 'stage', { o: claimed.operation_id, r: claimed.revision });
    await ctx.client.calls.transfer(row.parent_call_uuid, { legs: 'aleg', alegUrl: url, alegMethod: 'POST' });
    // Plivo's signed stage callback may arrive before the REST response.
    const latest = await load(ctx.db, row.id);
    return { ...resultFor(latest), success: true, pending: false, message: resultFor(claimed).message };
  } catch (error) {
    const latest = await load(ctx.db, row.id);
    if (latest.operation_id === body.operationId && latest.status !== 'routing') return resultFor(latest);
    const status = Number(error.statusCode || error.status);
    if (status >= 400 && status < 500) {
      await patch(ctx, claimed, { status: 'ringing', action: null, operation_id: null, requested_by: null, next_agent_id: null });
      throw new IncomingRoutingError(error instanceof IncomingRoutingError ? error.message : 'Call action was not accepted. The call has not been forwarded.', 409);
    }
    // A timed-out provider request may already have succeeded. Keep the intent
    // locked and report pending rather than retrying and dialing twice.
    return { ...resultFor(claimed), pending: true, success: false, message: 'Call action is being confirmed.' };
  }
}

async function mobileXml(req, ctx, row) {
  const number = await forwardNumber(ctx, row);
  if (!number) return incomingHangupXml;
  const action = `${ctx.publicBaseUrl || getPlivoWebhookBaseUrl(req)}/api/plivo/missed-call-handler`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${escapeXml(row.destination_number)}" timeout="25" action="${escapeXml(action)}" method="POST"><Number>${escapeXml(number)}</Number></Dial></Response>`;
}
export async function incomingRouteXml(req, event) {
  const url = new URL(req.url), mode = url.searchParams.get('mode');
  if (!['stage', 'event'].includes(mode)) throw new IncomingRoutingError('Invalid incoming callback.', 403);
  const ctx = await signedContext(url.searchParams.get('token'), mode), row = ctx.row;
  if (!eventMatches(row, event)) throw new IncomingRoutingError('Callback does not match the incoming call.', 403);
  if (mode === 'event') {
    if (ctx.payload.g === row.invite_revision && row.status === 'ringing' && ['answer', 'connected'].includes(lower(event.DialAction))) {
      await patch(ctx, row, { status: 'connected', expires_at: new Date(Date.now() + 4 * 3600000).toISOString() });
    }
    return incomingEmptyXml;
  }
  if (ctx.payload.o !== row.operation_id || !['next', 'forward'].includes(row.action)) return incomingHangupXml;
  if (['declined', 'ended', 'failed', 'connected'].includes(row.status)) return incomingHangupXml;
  if (row.status === 'routing') {
    if (ctx.payload.r !== row.revision) return incomingHangupXml;
    if (row.action === 'forward') {
      const updated = await patch(ctx, row, { status: 'forwarded', invite_revision: row.revision });
      if (!updated) throw new IncomingRoutingError('Routing state changed. Retry callback.', 503);
      return mobileXml(req, ctx, updated);
    }
    const next = (await availableAgents(ctx, row, ctx.payload.a)).find(agent => agent.id === row.next_agent_id);
    if (!next) {
      await patch(ctx, row, { status: 'failed' });
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Speak>No agent is available. Please call again later.</Speak><Hangup/></Response>`;
    }
    const oldAgents = row.ringing_agent_ids;
    const updated = await patch(ctx, row, { status: 'ringing', invite_revision: row.revision, ringing_agent_ids: [next.id],
      visited_agent_ids: [...new Set([...row.visited_agent_ids, ...oldAgents.filter(id => id !== next.id)])] });
    if (!updated) throw new IncomingRoutingError('Routing state changed. Retry callback.', 503);
    return incomingAgentDialXml(req, ctx, updated, [next]);
  }
  if (row.status === 'forwarded') return mobileXml(req, ctx, row);
  const agent = checked(await ctx.db.from('call_agents').select('*').eq('id', row.next_agent_id).eq('is_active', true).maybeSingle());
  return agent ? incomingAgentDialXml(req, ctx, row, [agent]) : incomingHangupXml;
}

// null means this is an older, untracked invitation: keep the existing
// fallback behavior byte-for-byte in its original route.
export async function incomingFallbackXml(req, event) {
  const url = new URL(req.url);
  if (!url.searchParams.has('token')) return null;
  const mode = url.searchParams.get('mode');
  if (!['notice', 'fallback'].includes(mode)) throw new IncomingRoutingError('Invalid incoming callback.', 403);
  const ctx = await signedContext(url.searchParams.get('token'), mode), row = ctx.row;
  if (!eventMatches(row, event)) throw new IncomingRoutingError('Callback does not match the incoming call.', 403);
  if (ctx.payload.g !== row.invite_revision || row.status === 'routing') return mode === 'notice' ? incomingEmptyXml : incomingHangupXml;
  if (['declined', 'ended', 'failed'].includes(row.status)) return incomingHangupXml;
  const completed = ['completed', 'answered'].includes(lower(event.DialStatus));
  if (completed || row.status === 'connected') {
    await patch(ctx, row, { status: 'ended' });
    return incomingHangupXml;
  }
  if (row.status === 'ringing') {
    const claimed = await patch(ctx, row, { status: 'forwarded', action: 'timeout', operation_id: randomUUID() });
    if (!claimed) throw new IncomingRoutingError('Routing state changed. Retry callback.', 503);
  }
  return mode === 'notice' ? incomingEmptyXml : mobileXml(req, ctx, row);
}
