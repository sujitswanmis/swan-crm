'use server';

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/adminClient';
import { validateNotificationPresentation, prioritizeNotificationQueue } from '@/utils/notificationPresentation';

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
  for (const key of ['emp_status', 'tenant_id', 'work_location_name', 'work_location_type', 'branch_id', 'emp_id', 'emp_department', 'emp_designation', 'role', 'department']) {
    if (Object.hasOwn(actor, key)) fields.push(key);
  }
  for (const key of ['emp_status', '_tenantId', 'work_location_name', 'work_location_type', 'branch_id', 'emp_id', 'emp_department', 'emp_designation', 'role', 'department']) {
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
    branch_id: row.notification_branch_id,
    emp_id: row.notification_emp_id,
    emp_department: row.notification_emp_department || row.notification_department,
    emp_designation: row.notification_emp_designation,
    role: row.notification_role
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
    const empId = u.emp_id || u.module_access?.emp_id || '—';
    const dept = u.emp_department || u.department || u.module_access?.emp_department || u.module_access?.department || 'General';
    const roleTitle = u.emp_designation || u.role || u.module_access?.emp_designation || u.module_access?.role || 'Staff';

    unique.set(u.user_id, {
      user_id: u.user_id,
      user_name: u.emp_name || u.email || 'User',
      email: u.email || '',
      emp_id: empId,
      department: dept,
      role: roleTitle,
      workspace_key: workspaceKey,
      workspace_name: workspaceName,
      location_key: locationKey,
      location_name: locationName,
      location_type: isHQ ? 'Headquarters' : match || legacyBranch ? 'Branch' : 'Unassigned',
      online: sessionsResult.known ? online.has(u.user_id) : null,
      status: u.emp_status || u.module_access?.emp_status || 'active'
    });
  }
  return [...unique.values()];
}
function selectAudience(users, input, isMasterAdmin = false) {
  if (!input) return users;
  const scope = input?.scope || 'all';
  if (!['all', 'workspace', 'headquarters', 'branches', 'employees'].includes(scope)) {
    throw new Error('Choose a valid audience scope.');
  }
  if (scope === 'all' && !isMasterAdmin) {
    throw new Error('All Workspaces broadcast requires authorized Master Admin privileges.');
  }

  let chosen = users;
  if (scope !== 'all' && scope !== 'employees') {
    if (!input.workspace) throw new Error('Select a valid workspace.');
    if (!users.some(u => u.workspace_key === input.workspace)) throw new Error('Selected workspace has no eligible users.');
    chosen = chosen.filter(u => u.workspace_key === input.workspace);
  }
  if (scope === 'headquarters') {
    chosen = chosen.filter(u => u.location_type === 'Headquarters');
  }
  if (scope === 'branches') {
    if (!Array.isArray(input.locations) || !input.locations.length || input.locations.length > 500) {
      throw new Error('Select at least one branch.');
    }
    const allowed = new Set(chosen.filter(u => u.location_type === 'Branch').map(u => u.location_key));
    if (input.locations.some(id => !allowed.has(id))) throw new Error('A selected branch is not in this workspace.');
    chosen = chosen.filter(u => input.locations.includes(u.location_key));
  }

  // Multi-Filter 1: Department (OR within multiple departments, AND with rest)
  if (Array.isArray(input.departments) && input.departments.length > 0) {
    const depts = new Set(input.departments.map(norm));
    chosen = chosen.filter(u => depts.has(norm(u.department)));
  }

  // Multi-Filter 2: Role / Designation (OR within multiple roles, AND with rest)
  if (Array.isArray(input.roles) && input.roles.length > 0) {
    const rSet = new Set(input.roles.map(norm));
    chosen = chosen.filter(u => rSet.has(norm(u.role)));
  }

  // Multi-Filter 3: Specific Employees
  if (Array.isArray(input.employees) && input.employees.length > 0) {
    const empSet = new Set(input.employees);
    chosen = chosen.filter(u => empSet.has(u.user_id));
  }

  // Multi-Filter 4: Online Only
  if (input.onlyOnline === true) {
    chosen = chosen.filter(u => u.online === true);
  }

  return chosen;
}
const snapshot = users => users.map(({ online, ...row }) => row).sort((a, b) => a.user_id.localeCompare(b.user_id));

export async function getBroadcastAudience(input = null) {
  try {
    const { db, actor } = await access(true);
    const users = await directory(db, actor);
    const isMaster = actor.role === 'masteradmin' || actor.module_access?.is_master_admin === true || MASTER_EMAILS.includes(norm(actor.email));
    const chosen = input ? selectAudience(users, input, isMaster) : users;

    const departments = [...new Set(users.map(u => u.department).filter(Boolean))].sort();
    const roles = [...new Set(users.map(u => u.role).filter(Boolean))].sort();

    return {
      success: true,
      directory: users,
      recipients: chosen,
      departments,
      roles,
      fingerprint: hash(snapshot(chosen))
    };
  } catch (error) { return { success: false, error: error.message, status: error.status || 500 }; }
}

export async function sendBroadcastNotification(input) {
  try {
    const { db, user, actor } = await access(true);
    const title = String(input?.title || '').trim();
    const message = String(input?.message || '').trim();
    const duration = Number(input?.duration_seconds);
    const hours = Number(input?.validity_hours);
    const notification_type = ['information', 'important', 'urgent', 'critical', 'policy_update', 'feedback_request'].includes(input?.notification_type)
      ? input.notification_type
      : 'information';
    const closeAliases = { auto_unread: 'auto_keep_unread', auto_viewed: 'auto_mark_viewed', manual: 'manual_close', required: 'acknowledgement_required' };
    const requestedCloseBehaviour = closeAliases[input?.close_behaviour] || input?.close_behaviour;
    const close_behaviour = ['auto_keep_unread', 'auto_mark_viewed', 'manual_close', 'acknowledgement_required'].includes(requestedCloseBehaviour)
      ? requestedCloseBehaviour
      : (duration === 0 ? 'manual_close' : 'auto_keep_unread');
    const is_draft = !!input?.is_draft;
    const is_test = !!input?.is_test;
    const scheduled_at = input?.scheduled_at ? new Date(input.scheduled_at).toISOString() : null;
    const isScheduled = !!(scheduled_at && new Date(scheduled_at) > new Date());

    if (!uuid(input?.id) || !title || title.length > 150 || !message || message.length > 4000) {
      throw new Error('Enter a title (150 max) and message (4000 max).');
    }
    if (!Number.isInteger(duration) || (duration !== 0 && (duration < 5 || duration > 300))) {
      throw new Error('Display time must be 5–300 seconds, or manual close.');
    }
    if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
      throw new Error('Validity must be between 1 and 720 hours.');
    }

    if (input?.scheduled_at && !is_draft) {
      const parsedSched = new Date(input.scheduled_at).getTime();
      if (isNaN(parsedSched) || parsedSched <= Date.now() + 30000) {
        throw new Error('Scheduled publish time must be in the future (at least 1 minute ahead in IST).');
      }
    }
    
    // Enrich audience with custom preset mode, placement style, color theme, action buttons, process list, rating and feedback toggles
    const preset_mode = ['single', 'process', 'spc_feedback_rating', 'announcement', 'acknowledgement', 'approval'].includes(input.preset_mode)
      ? input.preset_mode
      : 'single';
    const presentation = validateNotificationPresentation({
      placement_style: input.placement_style ?? input.audience?.placement_style,
      notification_size: input.notification_size ?? input.audience?.notification_size,
      entry_animation: input.entry_animation ?? input.audience?.entry_animation,
      animation_duration: input.animation_duration ?? input.audience?.animation_duration,
      notification_type
    });
    const color_theme = ['indigo', 'emerald', 'amber', 'rose'].includes(input.color_theme)
      ? input.color_theme
      : 'indigo';

    const finalAudience = {
      ...(typeof input.audience === 'object' && input.audience !== null ? input.audience : {}),
      preset_mode,
      ...presentation,
      color_theme,
      notification_type,
      close_behaviour,
      is_test,
      scheduled_at,
      action_buttons: (Array.isArray(input.action_buttons) && input.action_buttons.length > 0)
        ? input.action_buttons
        : [
            { id: 'understand', label: 'Understand', variant: 'primary' },
            { id: 'not_understand', label: 'Not Understand', variant: 'danger' }
          ],
      process_list: Array.isArray(input.process_list) ? input.process_list : [],
      process_options: (Array.isArray(input.process_options) && input.process_options.length > 0)
        ? input.process_options
        : [
            { id: 'working', label: 'Working', color: 'green' },
            { id: 'proper_not_working', label: 'Proper not working', color: 'yellow' },
            { id: 'not_working', label: 'Not working', color: 'red' }
          ],
      rating_prompt: input.rating_prompt || 'Rate your overall experience with SPC Workspace',
      allow_feedback: input.allow_feedback !== false,
      allow_reminder: input.allow_reminder !== false,
      responses: {}
    };

    // If saving as Draft
    if (is_draft) {
      const draftId = input.id;
      const draftPayload = {
        id: draftId,
        created_by: user.id,
        title,
        message,
        duration_seconds: duration,
        expires_at: new Date(Date.now() + hours * 3600000).toISOString(),
        audience: finalAudience,
        request_hash: 'draft_' + draftId,
        recipient_count: Math.max(1, Number(input.recipient_count) || 1),
        notification_type,
        close_behaviour,
        is_draft: true,
        status: 'draft',
        scheduled_at: scheduled_at || null,
        department_filter: input.audience?.departments || [],
        role_filter: input.audience?.roles || [],
        employee_filter: input.audience?.employees || []
      };
      const { error: draftErr } = await db.from('crm_broadcasts').upsert(draftPayload);
      if (draftErr) throw new Error(draftErr.message || 'Could not save draft');
      return { success: true, id: draftId, is_draft: true, count: 0 };
    }

    const requestHash = hash({ title, message, duration, hours, audience: finalAudience, fingerprint: input.fingerprint, is_test });
    const prior = checked(await db.from('crm_broadcasts').select('id,created_by,request_hash,recipient_count').eq('id', input.id).maybeSingle());
    if (prior) {
      if (prior.created_by !== user.id || prior.request_hash !== requestHash) throw new Error('Request changed. Preview again before sending.');
      return { success: true, id: prior.id, count: prior.recipient_count };
    }

    let recipients;
    if (is_test) {
      // Test broadcast only goes to the current Master Admin user
      recipients = [{
        user_id: user.id,
        user_name: actor.emp_name || user.email || 'Admin',
        email: user.email || '',
        emp_id: actor.emp_id || 'ADMIN',
        department: actor.emp_department || 'Administration',
        role: actor.role || 'Master Admin',
        workspace_key: 'test',
        workspace_name: 'Test Environment',
        location_key: 'test:hq',
        location_name: 'Headquarters',
        location_type: 'Headquarters'
      }];
    } else {
      recipients = snapshot(selectAudience(await directory(db, actor, true), input.audience, true));
      if (!recipients.length || recipients.length > 10000) throw new Error('Select between 1 and 10000 users.');
      if (input.fingerprint && hash(recipients) !== input.fingerprint) {
        if (input.audience?.onlyOnline && recipients.length > 0) {
          // Dynamic presence heartbeat; valid online recipients exist, proceed with dispatch
        } else {
          throw new Error('Audience changed. Refresh the audience preview before sending.');
        }
      }
    }

    const broadcastTitle = is_test ? `[TEST] ${title}` : title;
    const id = checked(await db.rpc('crm_send_broadcast', {
      p_message: { id: input.id, created_by: user.id, title: broadcastTitle, message, duration_seconds: duration,
        expires_at: new Date(Date.now() + hours * 3600000).toISOString(), audience: finalAudience, request_hash: requestHash },
      p_recipients: recipients
    }));

    // Non-blocking additive column updates
    try {
      await db.from('crm_broadcasts').update({
        notification_type,
        close_behaviour,
        is_draft: false,
        is_test,
        scheduled_at: scheduled_at || null,
        status: isScheduled ? 'scheduled' : 'active',
        action_buttons: finalAudience.action_buttons,
        allow_feedback: finalAudience.allow_feedback,
        allow_reminder: finalAudience.allow_reminder,
        department_filter: input.audience?.departments || [],
        role_filter: input.audience?.roles || [],
        employee_filter: input.audience?.employees || []
      }).eq('id', id);
    } catch {}

    try {
      for (const r of recipients) {
        await db.from('crm_broadcast_recipients').update({
          emp_id: r.emp_id || null,
          department: r.department || null,
          role: r.role || null
        }).eq('broadcast_id', id).eq('user_id', r.user_id);
      }
    } catch {}

    return { success: true, id, count: recipients.length, is_test, is_scheduled: isScheduled };
  } catch (error) { return { success: false, error: error.message }; }
}

export async function saveBroadcastDraft(input) {
  return sendBroadcastNotification({ ...input, is_draft: true });
}

export async function sendTestBroadcast(input) {
  return sendBroadcastNotification({ ...input, is_test: true, is_draft: false });
}

export async function replyToEmployeeFeedback({ broadcast_id, user_id, reply_text }) {
  try {
    const { db, actor } = await access(true);
    if (!uuid(broadcast_id) || !uuid(user_id)) throw new Error('Invalid broadcast or recipient ID.');
    const text = String(reply_text || '').trim();
    if (!text) throw new Error('Reply text cannot be empty.');
    const now = new Date().toISOString();

    const broadcast = checked(await db.from('crm_broadcasts').select('id,feedback_replies').eq('id', broadcast_id).single());
    const replies = Array.isArray(broadcast?.feedback_replies) ? broadcast.feedback_replies : [];
    const newReply = {
      user_id,
      admin_id: actor.user_id,
      admin_name: actor.emp_name || 'Admin',
      reply_text: text,
      replied_at: now
    };
    replies.push(newReply);

    try {
      await db.from('crm_broadcasts').update({ feedback_replies: replies }).eq('id', broadcast_id);
    } catch {}

    try {
      await db.from('crm_broadcast_recipients').update({
        admin_reply: text,
        admin_replied_at: now,
        query_status: 'in_progress'
      }).eq('broadcast_id', broadcast_id).eq('user_id', user_id);
    } catch {}

    return { success: true, reply: newReply };
  } catch (error) { return { success: false, error: error.message }; }
}

export async function resolveEmployeeQuery({ broadcast_id, user_id, status = 'resolved' }) {
  try {
    const { db } = await access(true);
    if (!uuid(broadcast_id) || !uuid(user_id)) throw new Error('Invalid broadcast or recipient ID.');
    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) throw new Error('Invalid query status.');
    const now = new Date().toISOString();

    try {
      await db.from('crm_broadcast_recipients').update({
        query_status: status
      }).eq('broadcast_id', broadcast_id).eq('user_id', user_id);
    } catch {}

    return { success: true, broadcast_id, user_id, query_status: status, updated_at: now };
  } catch (error) { return { success: false, error: error.message }; }
}

export async function deleteBroadcastDraft(id) {
  try {
    const { db } = await access(true);
    if (!uuid(id)) throw new Error('Invalid draft ID.');
    await db.from('crm_broadcasts').delete().eq('id', id).eq('is_draft', true);
    return { success: true, id };
  } catch (error) { return { success: false, error: error.message }; }
}

export async function getBroadcastReport(id = null) {
  try {
    const { db } = await access(true);
    if (id && !uuid(id)) throw new Error('Invalid notification.');
    const [historyResult, broadcastResult, recipients] = await Promise.all([
      db.from('crm_broadcasts').select('id,title,message,duration_seconds,created_at,expires_at,recipient_count,audience,notification_type,status,is_draft,is_test,scheduled_at,close_behaviour,feedback_replies').order('created_at', { ascending: false }).limit(200),
      id ? db.from('crm_broadcasts').select('id,title,expires_at,audience,created_at,duration_seconds,recipient_count,message,notification_type,status,is_draft,is_test,scheduled_at,close_behaviour,feedback_replies').eq('id', id).single() : { data: null },
      id ? allRows(() => db.from('crm_broadcast_recipients').select('*').eq('broadcast_id', id).order('user_id')) : []
    ]);
    const history = checked(historyResult);
    if (!id) {
      const prodBroadcasts = history.filter(h => !h.is_test && !h.is_draft);
      const totalTargeted = prodBroadcasts.reduce((acc, h) => acc + (Number(h.recipient_count) || 0), 0);
      return {
        success: true,
        history,
        summary: {
          totalBroadcasts: prodBroadcasts.length,
          totalTargetedUsers: totalTargeted,
          active: prodBroadcasts.filter(h => h.status === 'active').length,
          scheduled: prodBroadcasts.filter(h => h.status === 'scheduled').length,
          drafts: history.filter(h => h.is_draft).length,
          tests: history.filter(h => h.is_test).length
        },
        recipients: [],
        feedbackList: [],
        actionCounts: {}
      };
    }
    const broadcast = checked(broadcastResult);

    const responses = (typeof broadcast?.audience === 'object' && broadcast.audience?.responses) ? broadcast.audience.responses : {};
    const feedbackReplies = Array.isArray(broadcast?.feedback_replies) ? broadcast.feedback_replies : [];
    const replyMap = new Map();
    for (const rep of feedbackReplies) {
      if (rep.user_id) replyMap.set(rep.user_id, rep);
    }

    const isExpired = Date.parse(broadcast.expires_at) <= Date.now();
    const enrichedRecipients = recipients.map(row => {
      const resp = responses[row.user_id];
      const hasFeedback = (resp?.feedback_text || row.feedback_text);
      const reply = replyMap.get(row.user_id) || (row.admin_reply ? { reply_text: row.admin_reply, replied_at: row.admin_replied_at } : null);
      let queryStatus = row.query_status || (hasFeedback ? (reply ? 'in_progress' : 'open') : 'none');
      if (queryStatus === 'none' && hasFeedback) queryStatus = reply ? 'in_progress' : 'open';

      return {
        ...row,
        preset_mode: resp?.preset_mode || broadcast?.audience?.preset_mode || 'single',
        action_id: resp?.action_id || row.action_id || null,
        action_label: resp?.action_label || row.action_label || (row.read_at ? 'Read' : null),
        feedback_text: resp?.feedback_text || row.feedback_text || null,
        rating: resp?.rating || null,
        process_results: resp?.process_results || null,
        responded_at: resp?.responded_at || row.responded_at || row.read_at || null,
        remind_minutes: resp?.remind_minutes || null,
        viewed_at: row.viewed_at || row.shown_at || null,
        query_status: queryStatus,
        admin_reply: reply?.reply_text || row.admin_reply || null,
        admin_replied_at: reply?.replied_at || row.admin_replied_at || null
      };
    });

    const feedbackList = enrichedRecipients
      .filter(r => r.feedback_text && String(r.feedback_text).trim().length > 0)
      .map(r => ({
        user_id: r.user_id,
        user_name: r.user_name,
        email: r.email,
        emp_id: r.emp_id || '—',
        department: r.department || '—',
        role: r.role || '—',
        workspace_name: r.workspace_name,
        location_name: r.location_name,
        action_label: r.action_label || 'Feedback',
        action_id: r.action_id || 'feedback',
        rating: r.rating || null,
        feedback_text: r.feedback_text,
        responded_at: r.responded_at,
        query_status: r.query_status,
        admin_reply: r.admin_reply,
        admin_replied_at: r.admin_replied_at
      }));

    const actionCounts = {};
    enrichedRecipients.forEach(r => {
      if (r.action_id) {
        actionCounts[r.action_id] = (actionCounts[r.action_id] || 0) + 1;
      }
    });

    const summary = {
      totalBroadcasts: history.length,
      totalTargetedUsers: broadcast.recipient_count || enrichedRecipients.length,
      assigned: enrichedRecipients.length,
      displayed: enrichedRecipients.filter(r => r.shown_at).length,
      viewed: enrichedRecipients.filter(r => r.viewed_at || r.shown_at).length,
      acknowledged: enrichedRecipients.filter(r => r.read_at).length,
      pending: enrichedRecipients.filter(r => !r.read_at && !isExpired).length,
      snoozed: enrichedRecipients.filter(r => r.remind_minutes || r.action_id === 'snooze' || r.reminded_at).length,
      expired: enrichedRecipients.filter(r => !r.read_at && isExpired).length,
      feedbackReceived: feedbackList.length,
      unresolvedQueries: enrichedRecipients.filter(r => r.query_status === 'open' || r.query_status === 'in_progress').length
    };

    // Process Health Matrix
    const processStats = {};
    const processList = Array.isArray(broadcast?.audience?.process_list) ? broadcast.audience.process_list : [];
    if (processList.length > 0) {
      processList.forEach(p => {
        processStats[p.id] = { id: p.id, name: p.name, working: 0, proper_not_working: 0, not_working: 0, total: 0, issues: [] };
      });
      enrichedRecipients.forEach(r => {
        if (r.process_results && typeof r.process_results === 'object') {
          Object.entries(r.process_results).forEach(([pId, res]) => {
            if (processStats[pId] && res?.status) {
              processStats[pId].total++;
              if (res.status === 'working') processStats[pId].working++;
              else if (res.status === 'proper_not_working') {
                processStats[pId].proper_not_working++;
                if (res.remark) processStats[pId].issues.push({ user_id: r.user_id, user_name: r.user_name, email: r.email, workspace_name: r.workspace_name, location_name: r.location_name, status: 'proper_not_working', remark: res.remark, responded_at: r.responded_at });
              } else if (res.status === 'not_working') {
                processStats[pId].not_working++;
                if (res.remark) processStats[pId].issues.push({ user_id: r.user_id, user_name: r.user_name, email: r.email, workspace_name: r.workspace_name, location_name: r.location_name, status: 'not_working', remark: res.remark, responded_at: r.responded_at });
              }
            }
          });
        }
      });
    }

    // SPC Rating
    const ratingStats = { average: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, reviews: [] };
    let ratingSum = 0;
    enrichedRecipients.forEach(r => {
      if (r.rating && Number(r.rating) >= 1 && Number(r.rating) <= 5) {
        const star = Math.round(Number(r.rating));
        ratingStats.total++;
        ratingSum += star;
        ratingStats.distribution[star] = (ratingStats.distribution[star] || 0) + 1;
        if (r.feedback_text) {
          ratingStats.reviews.push({ user_id: r.user_id, user_name: r.user_name, email: r.email, workspace_name: r.workspace_name, location_name: r.location_name, rating: star, feedback_text: r.feedback_text, responded_at: r.responded_at });
        }
      }
    });
    if (ratingStats.total > 0) ratingStats.average = Number((ratingSum / ratingStats.total).toFixed(1));

    return {
      success: true,
      history,
      broadcast,
      summary,
      recipients: enrichedRecipients,
      feedbackList,
      actionCounts,
      processStats,
      ratingStats,
      checked_at: new Date().toISOString()
    };
  } catch (error) { return { success: false, error: error.message, status: error.status || 500 }; }
}

export async function getMyBroadcastNotifications(currentId = null) {
  try {
    const { db, user } = await access();
    if (currentId !== null && !uuid(currentId)) throw new Error('Invalid notification.');
    const base = () => db.from('crm_broadcast_recipients')
      .select('broadcast_id,delivered_at,shown_at,read_at,dismissed_at,crm_broadcasts!inner(id,title,message,duration_seconds,created_at,expires_at,audience)')
      .eq('user_id', user.id).is('read_at', null).gt('crm_broadcasts.expires_at', new Date().toISOString());
    const [inboxResult, pendingResult, currentResult] = await Promise.all([
      base().order('sent_at', { ascending: false }).limit(100),
      base().is('shown_at', null).order('sent_at').limit(50),
      currentId ? base().eq('broadcast_id', currentId).maybeSingle() : Promise.resolve({ data: null })
    ]);
    const inboxRows = (checked(inboxResult) || []).filter(r => r.crm_broadcasts?.audience?.broadcast_status !== 'cancelled');
    const pendingRows = (checked(pendingResult) || []).filter(r => {
      const status = r.crm_broadcasts?.audience?.broadcast_status;
      return status !== 'paused' && status !== 'cancelled';
    });
    return { success: true, userId: user.id, inbox: inboxRows, pending: prioritizeNotificationQueue(pendingRows), currentUnread: !!checked(currentResult) };
  } catch (error) { return { success: false, error: error.message, status: error.status || 500 }; }
}

export async function updateBroadcastStatus(id, action) {
  try {
    const { db } = await access(true);
    if (!uuid(id)) throw new Error('Invalid broadcast ID.');
    if (!['pause', 'resume', 'cancel'].includes(action)) throw new Error('Action must be pause, resume, or cancel.');
    const broadcast = checked(await db.from('crm_broadcasts').select('*').eq('id', id).maybeSingle());
    if (!broadcast) throw new Error('Broadcast not found.');
    const now = new Date().toISOString();
    const currentAudience = (typeof broadcast.audience === 'object' && broadcast.audience !== null) ? broadcast.audience : {};
    let nextStatus = 'active';
    let updateData = {};
    if (action === 'pause') {
      nextStatus = 'paused';
      updateData = { audience: { ...currentAudience, broadcast_status: 'paused', paused_at: now } };
    } else if (action === 'resume') {
      nextStatus = 'active';
      if (new Date(broadcast.expires_at) <= new Date()) throw new Error('Cannot resume an expired broadcast.');
      updateData = { audience: { ...currentAudience, broadcast_status: 'active', resumed_at: now } };
    } else if (action === 'cancel') {
      nextStatus = 'cancelled';
      updateData = { expires_at: now, audience: { ...currentAudience, broadcast_status: 'cancelled', cancelled_at: now } };
    }
    try {
      checked(await db.from('crm_broadcasts').update({ ...updateData, status: nextStatus }).eq('id', id));
    } catch {
      checked(await db.from('crm_broadcasts').update(updateData).eq('id', id));
    }
    if (action === 'cancel') {
      await db.from('crm_broadcast_recipients').update({ dismissed_at: now }).eq('broadcast_id', id).is('read_at', null).catch(() => {});
    }
    return { success: true, id, status: nextStatus, updated_at: now };
  } catch (error) { return { success: false, error: error.message }; }
}

export async function acknowledgeBroadcast(ids, mode, extra = {}) {
  try {
    const { db, user, actor } = await access();
    if (!Array.isArray(ids) || !ids.length || ids.length > 150 || !ids.every(uuid) || !['delivered', 'shown', 'viewed', 'read', 'dismissed', 'remind'].includes(mode)) throw new Error('Invalid notification receipt.');
    const broadcasts = checked(await db.from('crm_broadcasts').select('id,audience').in('id', ids).gt('expires_at', new Date().toISOString()));
    const validIds = broadcasts.map(b => b.id);
    if (!validIds.length) return { success: true, updated: [] };
    const now = new Date().toISOString();
    // Preserve the first delivery/read timestamp even across tabs and retries.
    checked(await db.from('crm_broadcast_recipients').update({ delivered_at: now }).eq('user_id', user.id).in('broadcast_id', validIds).is('delivered_at', null));
    if (mode === 'delivered') return { success: true, updated: validIds };

    if (mode === 'viewed') {
      try {
        await db.from('crm_broadcast_recipients').update({ viewed_at: now }).eq('user_id', user.id).in('broadcast_id', validIds).is('viewed_at', null);
      } catch {}
      return { success: true, updated: validIds, viewed: true };
    }

    // Record response action, process matrix, rating & feedback inside crm_broadcasts.audience.responses
    const action_id = extra?.action_id || (mode === 'remind' ? 'snooze' : 'read');
    const action_label = extra?.action_label || (mode === 'remind' ? `Snoozed (${extra?.remind_minutes || 15}m)` : 'Understood');
    const feedback_text = extra?.feedback_text ? String(extra.feedback_text).trim().slice(0, 1000) : '';
    const rating = extra?.rating ? Number(extra.rating) : null;
    const process_results = (typeof extra?.process_results === 'object' && extra?.process_results !== null) ? extra.process_results : null;
    const preset_mode = extra?.preset_mode || 'single';

    if (mode === 'read' || mode === 'remind') {
      for (const b of broadcasts) {
        try {
          const aud = (typeof b.audience === 'object' && b.audience !== null) ? b.audience : {};
          const responses = { ...(aud.responses || {}) };
          responses[user.id] = {
            user_id: user.id,
            user_name: actor?.emp_name || user.email || 'User',
            email: user.email || '',
            preset_mode,
            action_id,
            action_label,
            feedback_text,
            rating,
            process_results,
            remind_minutes: extra?.remind_minutes || null,
            responded_at: now
          };
          await db.from('crm_broadcasts').update({ audience: { ...aud, responses } }).eq('id', b.id);
        } catch {}
      }
    }

    if (mode === 'remind') {
      try {
        await db.from('crm_broadcast_recipients').update({ reminded_at: now }).eq('user_id', user.id).in('broadcast_id', validIds);
      } catch {}
      return { success: true, updated: validIds, snoozed: true, remind_minutes: extra?.remind_minutes || 15 };
    }

    const column = { shown: 'shown_at', read: 'read_at', dismissed: 'dismissed_at' }[mode];
    const updatePayload = { [column]: now };
    if (mode === 'read') {
      if (action_id) updatePayload.action_id = action_id;
      if (action_label) updatePayload.action_label = action_label;
      if (feedback_text) {
        updatePayload.feedback_text = feedback_text;
        updatePayload.query_status = 'open';
      }
      updatePayload.responded_at = now;
    }

    let changed;
    try {
      let query = db.from('crm_broadcast_recipients').update(updatePayload).eq('user_id', user.id).in('broadcast_id', validIds).is(column, null);
      if (mode === 'shown') query = query.is('read_at', null).is('dismissed_at', null);
      changed = checked(await query.select('broadcast_id'));
    } catch {
      // Safe fallback if optional columns are pending
      let fallbackQuery = db.from('crm_broadcast_recipients').update({ [column]: now }).eq('user_id', user.id).in('broadcast_id', validIds).is(column, null);
      if (mode === 'shown') fallbackQuery = fallbackQuery.is('read_at', null).is('dismissed_at', null);
      changed = checked(await fallbackQuery.select('broadcast_id'));
    }

    return { success: true, updated: changed.map(r => r.broadcast_id) };
  } catch (error) { return { success: false, error: error.message }; }
}
