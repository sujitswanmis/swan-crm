'use server';

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/adminClient';

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001';
const SWAN_CODES = ['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl'];
const MASTER_EMAILS = ['supujacreations@gmail.com', 'admin@newswangroup.com'];
const uuid = value => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(value || ''));
const norm = value => String(value || '').trim().toLowerCase();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const active = row => !['resigned', 'inactive', 'trash', 'draft', 'deleted', 'terminated', 'hold', 'suspended'].includes(norm(row.emp_status || row.module_access?.emp_status || 'active'));

function checked(result) {
  if (result.error) {
    if (['PGRST202', 'PGRST205', '42P01'].includes(result.error.code)) {
      throw new Error('Notification setup required: apply migrations/28_broadcast_notifications.sql in Supabase SQL Editor.');
    }
    throw new Error(result.error.message || 'Notification request failed');
  }
  return result.data;
}
async function access(master = false) {
  const session = await createClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) throw Object.assign(new Error('Please sign in again.'), { status: 401 });
  const db = getAdminClient();
  const actor = checked(await db.from('user_roles').select('*').eq('user_id', user.id).maybeSingle());
  if (!actor || !active(actor)) throw Object.assign(new Error('Notification access unavailable.'), { status: 403 });
  if (master && !(MASTER_EMAILS.includes(norm(user.email)) || norm(actor.role) === 'masteradmin' || actor.module_access?.is_master_admin === true)) {
    throw Object.assign(new Error('Only Master Admin can send notifications or view reports.'), { status: 403 });
  }
  return { db, user, actor };
}
// The authenticated actor's row describes which optional columns exist in this
// deployment. Keep column-over-JSON precedence without fetching full permissions
// and unrelated employee fields for every member of the audience.
function audienceUserFields(actor) {
  if (!actor) return '*';
  const fields = ['user_id', 'email', 'emp_name', 'company'];
  for (const key of ['emp_status', 'tenant_id', 'work_location_name', 'work_location_type', 'branch_id']) {
    if (Object.hasOwn(actor, key)) fields.push(key);
  }
  for (const key of ['emp_status', '_tenantId', 'work_location_name', 'work_location_type', 'branch_id']) {
    fields.push(`notification_${key}:module_access->${key}`);
  }
  return fields.join(',');
}
function audienceUser(row) {
  if (row.module_access) return row;
  return { ...row, module_access: {
    emp_status: row.notification_emp_status,
    _tenantId: row.notification__tenantId,
    work_location_name: row.notification_work_location_name,
    work_location_type: row.notification_work_location_type,
    branch_id: row.notification_branch_id
  } };
}
async function allRows(factory) {
  const rows = [];
  for (let start = 0; ; start += 500) {
    const page = checked(await factory().range(start, start + 499)) || [];
    rows.push(...page);
    if (page.length < 500) return rows;
    if (rows.length > 50000) throw new Error('Too many records. Narrow the selection.');
  }
}
async function directory(db, actor, includeOnline = true) {
  const [users, tenants, localText, branchResult, sessionsResult] = await Promise.all([
    allRows(() => db.from('user_roles').select(audienceUserFields(actor)).order('user_id')).then(rows => rows.map(audienceUser)),
    allRows(() => db.from('tenants').select('id,name,tenant_code,status').order('id')),
    fs.readFile(path.join(process.cwd(), 'src/config/tenant_branches.json'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '{}';
      throw error;
    }),
    allRows(() => db.from('tenant_branches').select('*').order('id')).catch(error => {
      if (error.message.includes('setup required')) return [];
      throw error;
    }),
    includeOnline ? allRows(() => db.from('user_sessions').select('user_id,last_active').eq('is_active', true)
      .gte('last_active', new Date(Date.now() - 5 * 60 * 1000).toISOString()).order('id')).then(rows => ({ rows, known: true })).catch(() => ({ rows: [], known: false })) : { rows: [], known: false }
  ]);
  const local = JSON.parse(localText);
  const branchMap = new Map();
  for (const b of [...branchResult, ...Object.entries(local).flatMap(([company, rows]) => Array.isArray(rows) ? rows.map(b => ({ ...b, company: b.company || company })) : [])]) {
    branchMap.set(`${norm(b.company)}:${b.id || b.branch_code}`, b);
  }
  const branches = [...branchMap.values()].filter(b => b.is_active !== false);
  const online = new Set(sessionsResult.rows.map(r => r.user_id));
  const unique = new Map();
  for (const u of users.filter(u => uuid(u.user_id) && active(u))) {
    const company = norm(u.company);
    const explicitTenant = u.tenant_id || u.module_access?._tenantId;
    // Explicit tenant identity wins. Never broaden unknown/mismatched assignments into another tenant.
    const tenant = explicitTenant ? tenants.find(t => t.id === explicitTenant) :
      tenants.find(t => norm(t.name) === company || norm(t.tenant_code) === company) ||
      (SWAN_CODES.includes(company) ? tenants.find(t => t.id === DEFAULT_TENANT) : null);
    const workspaceKey = tenant?.id || `unassigned:${company || 'unknown'}`;
    const workspaceName = tenant?.name || (u.company ? `${u.company} (unmapped workspace)` : 'Unassigned workspace');
    const candidates = branches.filter(b => tenant && (b.tenant_id === tenant.id || norm(b.company) === norm(tenant.name) || norm(b.company) === norm(tenant.tenant_code)));
    const location = norm(u.work_location_name || u.module_access?.work_location_name);
    const locationType = norm(u.work_location_type || u.module_access?.work_location_type);
    const explicitBranch = u.branch_id || u.module_access?.branch_id;
    const match = explicitBranch ? candidates.find(b => b.id === explicitBranch) :
      candidates.find(b => location && location !== 'none' && [norm(b.branch_name), norm(b.branch_code)].includes(location)) ||
      candidates.find(b => [norm(b.branch_code), norm(b.branch_name)].includes(company));
    const explicitHQ = ['headquarter', 'headquarters', 'head office', 'hq'].includes(locationType);
    const isHQ = match ? ['headquarter', 'headquarters', 'head office', 'hq'].includes(norm(match.location_type)) : explicitHQ;
    const legacyBranch = !explicitBranch && !match && tenant?.id === DEFAULT_TENANT && SWAN_CODES.includes(company) && !['new swan group', 'swan agro'].includes(company);
    const locationName = match?.branch_name || (isHQ ? 'Headquarters' : legacyBranch ? u.company : 'Unassigned location');
    const locationKey = `${workspaceKey}:${match?.id || match?.branch_code || (isHQ ? 'hq' : legacyBranch ? company : 'unassigned')}`;
    unique.set(u.user_id, { user_id: u.user_id, user_name: u.emp_name || u.email || 'User', email: u.email || '',
      workspace_key: workspaceKey, workspace_name: workspaceName, location_key: locationKey,
      location_name: locationName, location_type: isHQ ? 'Headquarters' : match || legacyBranch ? 'Branch' : 'Unassigned',
      online: sessionsResult.known ? online.has(u.user_id) : null });
  }
  return [...unique.values()];
}
function selectAudience(users, input) {
  const scope = input?.scope;
  if (!['all', 'workspace', 'headquarters', 'branches'].includes(scope)) throw new Error('Choose an audience.');
  let chosen = users;
  if (scope !== 'all') {
    if (!users.some(u => u.workspace_key === input.workspace)) throw new Error('Select a valid workspace.');
    chosen = chosen.filter(u => u.workspace_key === input.workspace);
  }
  if (scope === 'headquarters') chosen = chosen.filter(u => u.location_type === 'Headquarters');
  if (scope === 'branches') {
    if (!Array.isArray(input.locations) || !input.locations.length || input.locations.length > 500) throw new Error('Select at least one branch.');
    const allowed = new Set(chosen.filter(u => u.location_type === 'Branch').map(u => u.location_key));
    if (input.locations.some(id => !allowed.has(id))) throw new Error('A selected branch is not in this workspace.');
    chosen = chosen.filter(u => input.locations.includes(u.location_key));
  }
  return chosen;
}
const snapshot = users => users.map(({ online, ...row }) => row).sort((a, b) => a.user_id.localeCompare(b.user_id));

export async function getBroadcastAudience(input = null) {
  try {
    const { db, actor } = await access(true);
    const users = await directory(db, actor);
    const chosen = input ? selectAudience(users, input) : users;
    return { success: true, directory: users, recipients: chosen, fingerprint: hash(snapshot(chosen)) };
  } catch (error) { return { success: false, error: error.message, status: error.status || 500 }; }
}

export async function sendBroadcastNotification(input) {
  try {
    const { db, user, actor } = await access(true);
    const title = String(input?.title || '').trim();
    const message = String(input?.message || '').trim();
    const duration = Number(input?.duration_seconds);
    const hours = Number(input?.validity_hours);
    if (!uuid(input?.id) || !title || title.length > 120 || !message || message.length > 4000) throw new Error('Enter a title (120 max) and message (4000 max).');
    if (!Number.isInteger(duration) || (duration !== 0 && (duration < 5 || duration > 300))) throw new Error('Display time must be 5–300 seconds, or manual close.');
    if (!Number.isFinite(hours) || hours < 1 || hours > 720) throw new Error('Validity must be between 1 and 720 hours.');
    const requestHash = hash({ title, message, duration, hours, audience: input.audience, fingerprint: input.fingerprint });
    const prior = checked(await db.from('crm_broadcasts').select('id,created_by,request_hash,recipient_count').eq('id', input.id).maybeSingle());
    if (prior) {
      if (prior.created_by !== user.id || prior.request_hash !== requestHash) throw new Error('Request changed. Preview again before sending.');
      return { success: true, id: prior.id, count: prior.recipient_count };
    }
    const recipients = snapshot(selectAudience(await directory(db, actor, false), input.audience));
    if (!recipients.length || recipients.length > 10000) throw new Error('Select between 1 and 10000 users.');
    if (hash(recipients) !== input.fingerprint) throw new Error('Audience changed. Refresh the audience preview before sending.');
    const id = checked(await db.rpc('crm_send_broadcast', {
      p_message: { id: input.id, created_by: user.id, title, message, duration_seconds: duration,
        expires_at: new Date(Date.now() + hours * 3600000).toISOString(), audience: input.audience, request_hash: requestHash },
      p_recipients: recipients
    }));
    return { success: true, id, count: recipients.length };
  } catch (error) { return { success: false, error: error.message }; }
}

export async function getBroadcastReport(id = null) {
  try {
    const { db } = await access(true);
    if (id && !uuid(id)) throw new Error('Invalid notification.');
    const [historyResult, broadcastResult, recipients] = await Promise.all([
      db.from('crm_broadcasts').select('id,title,message,duration_seconds,created_at,expires_at,recipient_count,audience').order('created_at', { ascending: false }).limit(100),
      id ? db.from('crm_broadcasts').select('id,title,expires_at').eq('id', id).single() : { data: null },
      id ? allRows(() => db.from('crm_broadcast_recipients').select('*').eq('broadcast_id', id).order('user_id')) : []
    ]);
    const history = checked(historyResult);
    if (!id) return { success: true, history, recipients: [] };
    const broadcast = checked(broadcastResult);
    return { success: true, history, broadcast, recipients, checked_at: new Date().toISOString() };
  } catch (error) { return { success: false, error: error.message, status: error.status || 500 }; }
}

export async function getMyBroadcastNotifications(currentId = null) {
  try {
    const { db, user } = await access();
    if (currentId !== null && !uuid(currentId)) throw new Error('Invalid notification.');
    const base = () => db.from('crm_broadcast_recipients')
      .select('broadcast_id,delivered_at,shown_at,read_at,dismissed_at,crm_broadcasts!inner(id,title,message,duration_seconds,created_at,expires_at)')
      .eq('user_id', user.id).is('read_at', null).gt('crm_broadcasts.expires_at', new Date().toISOString());
    const [inboxResult, pendingResult, currentResult] = await Promise.all([
      base().order('sent_at', { ascending: false }).limit(100),
      base().is('shown_at', null).order('sent_at').limit(50),
      currentId ? base().eq('broadcast_id', currentId).maybeSingle() : Promise.resolve({ data: null })
    ]);
    return { success: true, userId: user.id, inbox: checked(inboxResult), pending: checked(pendingResult), currentUnread: !!checked(currentResult) };
  } catch (error) { return { success: false, error: error.message, status: error.status || 500 }; }
}

export async function acknowledgeBroadcast(ids, mode) {
  try {
    const { db, user } = await access();
    if (!Array.isArray(ids) || !ids.length || ids.length > 150 || !ids.every(uuid) || !['delivered', 'shown', 'read', 'dismissed'].includes(mode)) throw new Error('Invalid notification receipt.');
    const broadcasts = checked(await db.from('crm_broadcasts').select('id').in('id', ids).gt('expires_at', new Date().toISOString()));
    const validIds = broadcasts.map(b => b.id);
    if (!validIds.length) return { success: true, updated: [] };
    const now = new Date().toISOString();
    // Preserve the first delivery/read timestamp even across tabs and retries.
    checked(await db.from('crm_broadcast_recipients').update({ delivered_at: now }).eq('user_id', user.id).in('broadcast_id', validIds).is('delivered_at', null));
    if (mode === 'delivered') return { success: true, updated: validIds };
    const column = { shown: 'shown_at', read: 'read_at', dismissed: 'dismissed_at' }[mode];
    let query = db.from('crm_broadcast_recipients').update({ [column]: now }).eq('user_id', user.id).in('broadcast_id', validIds).is(column, null);
    if (mode === 'shown') query = query.is('read_at', null).is('dismissed_at', null);
    const changed = checked(await query.select('broadcast_id'));
    return { success: true, updated: changed.map(r => r.broadcast_id) };
  } catch (error) { return { success: false, error: error.message }; }
}
