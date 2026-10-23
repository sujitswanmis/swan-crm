import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import plivo from 'plivo';
import { createClient } from '@supabase/supabase-js';
import { getWorkspaceTelephonyConfig } from '@/utils/telephonyConfig';
import { normalizeIndianPhoneNumber } from '@/app/api/plivo/phone-number';
import { getPlivoWebhookBaseUrl } from '@/app/api/plivo/utils';

const TABLE = 'call_consultations';
const BUSY = ['preparing', 'dialing', 'ringing', 'consulting', 'merging', 'cancelling'];
const CONNECTED = ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected'];
export const CONSULTATION_PROTOCOL = 'crm-consultation-v1';
export const CONSULTATION_HOLD_AUDIO = '/plivo-hold-tone.wav';
export const hangupXml = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
const now = () => new Date().toISOString();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const asBool = value => value === true || value === 'true';
const xmlEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[c]);

export class ConsultationError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}

export function isConsultationSession(session) {
  return /^mpc_[a-f0-9-]{36}$/i.test(session?.conference_name || '');
}

function storageError(error) {
  if (error) throw new ConsultationError('Add Call setup is not ready. Your existing call is unchanged.', 503);
}

// A transient callback failure must not return Hangup for an existing caller.
// Ask Plivo to retry this callback while the storage/provider recovers.
export function consultationRetryXml(req) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Wait length="2"/><Redirect method="POST">${xmlEscape(req.url)}</Redirect></Response>`;
}

export async function loadConsultation(db, sessionId) {
  const { data, error } = await db.from(TABLE).select('*').eq('session_id', sessionId).maybeSingle();
  storageError(error);
  return data;
}

// Optimistic updates prevent duplicate dials and late callbacks from reverting
// Merge/Cancel. Only this new table is used for locks; no global call state.
async function patch(ctx, changes, phases, attemptId) {
  for (let retry = 0; retry < 4; retry++) {
    const current = await loadConsultation(ctx.db, ctx.session.id);
    if (!current || (phases && !phases.includes(current.phase)) ||
        (attemptId && current.attempt_id !== attemptId)) {
      throw new ConsultationError('Call controls changed. Please refresh the call status.');
    }
    const delta = typeof changes === 'function' ? changes(current) : changes;
    if (!delta) return current;
    const payload = { ...delta, revision: current.revision + 1, updated_at: now() };
    if (delta.data) payload.data = { ...current.data, ...delta.data };
    const { data, error } = await ctx.db.from(TABLE).update(payload)
      .eq('id', current.id).eq('revision', current.revision).select('*').maybeSingle();
    storageError(error);
    if (data) return data;
  }
  throw new ConsultationError('Another call action is in progress. Please retry.');
}

function provider(ctx) { return ctx.client.multiPartyCalls; }

async function participants(ctx, row) {
  const result = await provider(ctx).listParticipants({ friendlyName: row.mpc_name });
  // Plivo includes historical participants after exit, with hold/mute=null.
  // Those rows must never be held, kicked, merged, or shown as live callers.
  return (result?.objects || result?.participants || [])
    .filter(p => !p.exitTime && !p.exit_time)
    .map(p => ({
      ...p, memberId: String(p.memberId ?? p.member_id ?? ''),
      callUuid: p.callUuid || p.call_uuid, hold: asBool(p.hold), mute: asBool(p.mute),
    }));
}

async function contextFor(db, session, company, userId) {
  const config = await getWorkspaceTelephonyConfig(company);
  if (!config.authId || !config.authToken) throw new ConsultationError('Calling account is not configured.', 503);
  return {
    db, session, company, userId, config,
    client: new plivo.Client(config.authId, config.authToken, { timeout: 10000 }),
  };
}

export async function openConsultation(roomName, userId) {
  if (!/^room_[A-Za-z0-9_]{1,64}$/.test(roomName || '')) throw new ConsultationError('Invalid call room.', 400);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: session, error } = await db.from('call_sessions').select('*').eq('room_name', roomName).maybeSingle();
  if (error || !session) throw new ConsultationError('Call not found.', 404);
  const { data: agent } = await db.from('call_agents').select('user_id').eq('id', session.agent_id).maybeSingle();
  if (!userId || agent?.user_id !== userId) throw new ConsultationError('This call belongs to another agent.', 403);
  const { data: role } = await db.from('user_roles').select('company').eq('user_id', userId).maybeSingle();
  return contextFor(db, session, role?.company || '', userId);
}

export async function resolveConsultation(db, session) {
  if (!isConsultationSession(session)) return null;
  const row = await loadConsultation(db, session.id);
  if (!row || session.conference_name !== row.mpc_name) throw new ConsultationError('Call controls could not be loaded.', 503);
  return { ctx: await contextFor(db, session, row.company, row.owner_user_id), row };
}

export function consultationBaseUrl(req) {
  if (/^https?:\/\/(localhost|127\.)/i.test(req?.url || '') && !process.env.PLIVO_CONSULTATION_BASE_URL) {
    throw new ConsultationError('Local Add Call needs a public HTTPS tunnel in PLIVO_CONSULTATION_BASE_URL. Your existing call is unchanged.', 503);
  }
  const value = process.env.PLIVO_CONSULTATION_BASE_URL || getPlivoWebhookBaseUrl(req);
  let url;
  try { url = new URL(value); } catch { throw new ConsultationError('A public calling webhook is required.', 503); }
  if (url.protocol !== 'https:' || url.username || url.password ||
      /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(url.hostname)) {
    throw new ConsultationError('A public HTTPS calling webhook is required. Your existing call is unchanged.', 503);
  }
  if (new URL(getPlivoWebhookBaseUrl(req)).origin !== url.origin) {
    throw new ConsultationError('Set NEXT_PUBLIC_APP_URL and PLIVO_CONSULTATION_BASE_URL to the same updated public server, then start a fresh call. Your existing call is unchanged.', 503);
  }
  return url.origin;
}

function token(ctx, row, mode, role, attempt = '') {
  return createHmac('sha256', ctx.config.authToken)
    .update(`${row.id}:${mode}:${role}:${attempt}`).digest('hex');
}

export function consultationWebhookUrl(ctx, row, mode, role = '', attempt = '') {
  const query = new URLSearchParams({ id: row.id, mode, role, attempt,
    token: token(ctx, row, mode, role, attempt) });
  return `${row.data.base_url}/api/plivo/consultation-webhook?${query}`;
}

export async function openConsultationWebhook(req) {
  const url = new URL(req.url), id = url.searchParams.get('id');
  if (!/^[a-f0-9-]{36}$/i.test(id || '')) throw new ConsultationError('Invalid callback.', 403);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: row, error } = await db.from(TABLE).select('*').eq('id', id).maybeSingle();
  storageError(error);
  if (!row) throw new ConsultationError('Unknown callback.', 403);
  const { data: session, error: sessionError } = await db.from('call_sessions').select('*').eq('id', row.session_id).maybeSingle();
  storageError(sessionError);
  if (!session) throw new ConsultationError('Call not found.', 403);
  const ctx = await contextFor(db, session, row.company, row.owner_user_id);
  const mode = url.searchParams.get('mode') || '', role = url.searchParams.get('role') || '';
  const attempt = url.searchParams.get('attempt') || '', received = url.searchParams.get('token') || '';
  const expected = token(ctx, row, mode, role, attempt);
  if (!/^[a-f0-9]{64}$/i.test(received) ||
      !timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new ConsultationError('Invalid callback signature.', 403);
  }
  return { ctx, row, mode, role, attempt };
}

export function consultationAnswerXml(ctx, row, role) {
  if (!['agent', 'customer'].includes(role) || row.phase === 'ended' ||
      !CONNECTED.includes(ctx.session.status)) return hangupXml;
  const holding = role === 'customer' && BUSY.includes(row.phase);
  const attrs = {
    role: role === 'agent' ? 'Agent' : 'Customer', hold: String(holding),
    stayAlone: 'true', startMpcOnEnter: 'true', endMpcOnExit: String(role === 'agent'),
    enterSound: 'none', exitSound: 'none', record: 'true', recordFileFormat: 'mp3',
    statusCallbackUrl: consultationWebhookUrl(ctx, row, 'events'), statusCallbackMethod: 'POST',
    statusCallbackEvents: 'mpc-state-changes,participant-state-changes',
    recordingCallbackUrl: consultationWebhookUrl(ctx, row, 'record'), recordingCallbackMethod: 'POST',
    agentHoldMusicUrl: consultationWebhookUrl(ctx, row, 'hold'), agentHoldMusicMethod: 'GET',
    customerHoldMusicUrl: consultationWebhookUrl(ctx, row, 'hold'), customerHoldMusicMethod: 'GET',
  };
  return `<?xml version="1.0" encoding="UTF-8"?><Response><MultiPartyCall ${Object.entries(attrs)
    .map(([key, value]) => `${key}="${xmlEscape(value)}"`).join(' ')}>${xmlEscape(row.mpc_name)}</MultiPartyCall></Response>`;
}

async function requireReachableWebhook(baseUrl, fetcher = fetch) {
  try {
    const response = await fetcher(`${baseUrl}/api/plivo/consultation-webhook?health=1`, {
      cache: 'no-store', signal: AbortSignal.timeout(4000),
    });
    if (response.ok && (await response.json()).protocol === CONSULTATION_PROTOCOL) return;
  } catch { /* Fail before holding or transferring any live caller. */ }
  throw new ConsultationError('Updated call controls are not publicly reachable yet. Your existing call is unchanged.', 503);
}

export function consultationView(row, members = []) {
  if (!row) return null;
  return {
    phase: row.phase, attemptId: row.attempt_id,
    number: row.data.guest_number || '', error: row.data.last_error || '',
    providerCode: row.data.provider_code || null,
    customerHeld: (row.data.held_members || []).length > 0 &&
      (row.data.held_members || []).every(previous => members.some(p =>
        (p.memberId === previous.id || p.callUuid === previous.callUuid) && p.hold)),
    canMerge: row.phase === 'consulting', busy: BUSY.includes(row.phase) || row.phase === 'failed',
    controlsOnly: !!row.data.controls_only,
    updatedAt: row.updated_at,
    members: members.map(p => ({
      memberId: p.memberId, callUuid: p.callUuid, muted: p.mute, held: p.hold,
      callerName: p.callUuid === row.data.agent_call_uuid ? 'Agent (You)' :
        p.callUuid === row.data.customer_call_uuid ? 'Customer' :
        p.callUuid === row.data.guest_call_uuid || row.data.participant_numbers?.[p.callUuid] ? 'Third person' : 'Participant',
      phoneNumber: p.callUuid === row.data.agent_call_uuid ? '' : normalizeIndianPhoneNumber(
        p.callUuid === row.data.customer_call_uuid ? row.data.customer_number :
          p.callUuid === row.data.guest_call_uuid ? row.data.guest_number : row.data.participant_numbers?.[p.callUuid]
      ) || '',
      joinTime: p.joinTime ? new Date(p.joinTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Active',
    })),
  };
}

async function restoreHolds(ctx, row) {
  const live = await participants(ctx, row);
  const restoring = (row.data.held_members || []).map(previous => ({ ...previous,
    id: live.find(p => p.memberId === previous.id || p.callUuid === previous.callUuid)?.memberId,
  })).filter(previous => previous.id);
  for (const previous of restoring) {
    if (live.some(p => p.memberId === previous.id)) {
      await provider(ctx).updateParticipant(previous.id, {
        friendlyName: row.mpc_name, hold: previous.hold, disableStateChangeSound: true,
      });
    }
  }
  const confirmed = await participants(ctx, row);
  if (restoring.some(previous =>
    confirmed.some(p => p.memberId === previous.id && p.hold !== previous.hold))) {
    throw new ConsultationError('Caller resume could not be confirmed. Please retry Cancel.');
  }
  return patch(ctx, { phase: 'active', data: { held_members: [] } }, ['cancelling', 'preparing', 'failed'], row.attempt_id);
}

async function cancelGuest(ctx, row, errorMessage = '') {
  // Callback retries, UI Cancel, and reconciliation may arrive together. Only
  // one worker may unhold callers; a short lease permits crash recovery.
  const worker = randomUUID();
  row = await patch(ctx, current => {
    if (current.data.cancel_worker && Date.parse(current.data.cancel_lease_until) > Date.now()) return null;
    return { phase: 'cancelling', data: { last_error: errorMessage || current.data.last_error,
      cancel_worker: worker, cancel_lease_until: new Date(Date.now() + 55000).toISOString() } };
  },
    ['preparing', 'dialing', 'ringing', 'consulting', 'cancelling', 'failed'], row.attempt_id);
  if (row.data.cancel_worker !== worker) return row;
  try { return await finishCancellation(ctx, row); }
  finally {
    try {
      await patch(ctx, current => current.data.cancel_worker === worker
        ? { data: { cancel_worker: null, cancel_lease_until: null } } : null,
      undefined, row.attempt_id);
    } catch { /* A new attempt or End Call already superseded this worker. */ }
  }
}

async function finishCancellation(ctx, row) {
  const guestUuid = row.data.guest_call_uuid, requestUuid = row.data.guest_request_uuid;
  const live = await participants(ctx, row);
  const guests = live.filter(p => p.callUuid === guestUuid ||
    !(row.data.baseline_call_uuids || []).includes(p.callUuid));
  let cancellationConfirmed = !!row.data.guest_terminal || !row.data.dial_requested;
  for (const guest of guests) {
    try { await provider(ctx).kickParticipant(guest.memberId, { friendlyName: row.mpc_name }); }
    catch (error) {
      // The guest may leave between the list and kick. Still re-list below
      // before allowing any original caller to be unheld.
      if (!/participant already exited/i.test(error.message || '')) throw error;
    }
    cancellationConfirmed = true;
  }
  if (requestUuid && !row.data.guest_terminal) {
    try { await ctx.client.calls.cancel(requestUuid); cancellationConfirmed = true; }
    catch { /* It may already be answered; try its call UUID next. */ }
  }
  if (!cancellationConfirmed && guestUuid) {
    try { await ctx.client.calls.hangup(guestUuid); cancellationConfirmed = true; }
    catch {
      try { await ctx.client.calls.cancel(guestUuid); cancellationConfirmed = true; }
      catch { /* A terminal callback or a later Cancel must confirm removal. */ }
    }
  }
  // A Cancel while addParticipant is still in flight must not expose the
  // original caller to a guest whose request UUID has not arrived yet.
  if (row.data.dial_requested && !row.data.dial_finished && !row.data.guest_terminal) return row;
  if (!cancellationConfirmed) return row;
  const remaining = await participants(ctx, row);
  if (remaining.some(p => p.callUuid === guestUuid ||
      !(row.data.baseline_call_uuids || []).includes(p.callUuid))) return row;
  return restoreHolds(ctx, row);
}

export async function startConsultation(ctx, number, baseUrl, options = {}) {
  const directControl = options.directControl;
  const dialTo = directControl ? '' : normalizeIndianPhoneNumber(number);
  if (!directControl && !dialTo) throw new ConsultationError('Enter a valid 10-digit Indian number.', 400);
  if (ctx.session.status !== 'connected' || !ctx.session.agent_call_uuid || !ctx.session.customer_call_uuid) {
    throw new ConsultationError('Both callers must be connected before Add Call.');
  }
  if (!directControl && !ctx.config.fromNumber) throw new ConsultationError('Calling number is not configured.', 503);
  if (ctx.session.conference_name && !isConsultationSession(ctx.session)) {
    throw new ConsultationError('This call is already using the previous conference controls.');
  }
  let row = await loadConsultation(ctx.db, ctx.session.id);
  if (row && (BUSY.includes(row.phase) || row.phase === 'failed')) throw new ConsultationError('Finish or cancel the previous Add Call first.');
  await requireReachableWebhook(baseUrl, options.fetcher);
  const attempt = randomUUID();
  const data = {
    base_url: baseUrl, agent_call_uuid: ctx.session.agent_call_uuid,
    customer_call_uuid: ctx.session.customer_call_uuid, guest_number: dialTo,
    customer_number: normalizeIndianPhoneNumber(ctx.session.customer_number) || '',
    participant_numbers: { ...row?.data.participant_numbers,
      ...(row?.data.guest_call_uuid && row?.data.guest_number
        ? { [row.data.guest_call_uuid]: row.data.guest_number } : {}),
    },
    guest_call_uuid: null, guest_request_uuid: null, guest_terminal: false,
    guest_member_id: null, last_error: '', provider_code: null,
    held_members: isConsultationSession(ctx.session) ? [] : [{ callUuid: ctx.session.customer_call_uuid, hold: false }],
    baseline_call_uuids: [...new Set([ctx.session.agent_call_uuid, ctx.session.customer_call_uuid,
      ...(row?.data.baseline_call_uuids || []), row?.data.guest_call_uuid].filter(Boolean))],
    dial_requested: false, dial_finished: false, started_at: now(),
    cancel_worker: null, cancel_lease_until: null,
    controls_only: !!directControl,
  };
  if (row) {
    row = await patch(ctx, { phase: 'preparing', attempt_id: attempt, data }, ['active', 'merged']);
  } else {
    const { data: inserted, error } = await ctx.db.from(TABLE).insert({
      id: randomUUID(), session_id: ctx.session.id, room_name: ctx.session.room_name,
      agent_id: ctx.session.agent_id, owner_user_id: ctx.userId, company: ctx.company,
      mpc_name: `mpc_${ctx.session.id}`, attempt_id: attempt,
      phase: 'preparing', data,
    }).select('*').single();
    if (error?.code === '23505') throw new ConsultationError('Another Add Call is in progress.');
    storageError(error);
    row = inserted;
  }
  let transferAccepted = isConsultationSession(ctx.session);
  try {
    if (!transferAccepted) {
      const { data: claimed, error } = await ctx.db.from('call_sessions').update({ conference_name: row.mpc_name })
        .eq('id', ctx.session.id).eq('status', 'connected').is('conference_name', null).select('id');
      if (error || !claimed?.length) throw new ConsultationError('Call changed before Add Call. Please retry.');
      await ctx.client.calls.transfer(ctx.session.agent_call_uuid, {
        legs: 'both', alegUrl: consultationWebhookUrl(ctx, row, 'answer', 'agent'), alegMethod: 'POST',
        blegUrl: consultationWebhookUrl(ctx, row, 'answer', 'customer'), blegMethod: 'POST',
      });
      transferAccepted = true;
    }
    let live = [];
    // Public answer callbacks can take several seconds to arrive. Manual
    // controls wait up to ~12 seconds; Add Call retains its existing budget.
    const readinessChecks = directControl ? 30 : 12;
    const readinessDelay = options.pollDelay ?? (directControl ? 400 : 300);
    const readinessDeadline = directControl ? Date.now() + 12000 : Infinity;
    for (let retry = 0; retry < readinessChecks; retry++) {
      if (retry > 0 && Date.now() >= readinessDeadline) break;
      try { live = await participants(ctx, row); } catch { /* Transfer callbacks may still be arriving. */ }
      if ([ctx.session.agent_call_uuid, ctx.session.customer_call_uuid].every(id => live.some(p => p.callUuid === id))) break;
      if (retry < readinessChecks - 1) await sleep(readinessDelay);
    }
    if (![ctx.session.agent_call_uuid, ctx.session.customer_call_uuid].every(id => live.some(p => p.callUuid === id))) {
      throw new ConsultationError(directControl
        ? 'Call controls are taking longer to connect. Please check the call and retry Hold/Mute.'
        : 'Call controls are still connecting. No third-person call was placed.');
    }
    const held = live.filter(p => p.callUuid !== ctx.session.agent_call_uuid).map(p => ({ id: p.memberId, hold: p.hold }));
    // The initial customer XML already holds them. Record the state to resume
    // after consultation; on subsequent Add Calls preserve manual holds.
    if (!isConsultationSession(ctx.session)) held.forEach(p => { p.hold = false; });
    row = await patch(ctx, { data: { held_members: held, baseline_call_uuids: live.map(p => p.callUuid) } }, ['preparing'], attempt);
    if (directControl) {
      // A manual control uses the same guarded two-leg promotion as Add Call,
      // but must never dial a guest or enter a consultation/merge phase.
      const targetUuid = directControl.role === 'agent' ? ctx.session.agent_call_uuid : ctx.session.customer_call_uuid;
      const target = live.find(p => p.callUuid === targetUuid);
      const isHold = ['hold', 'unhold'].includes(directControl.action);
      const field = isHold ? 'hold' : 'mute';
      const enabled = ['hold', 'mute'].includes(directControl.action);
      await provider(ctx).updateParticipant(target.memberId, {
        friendlyName: row.mpc_name, [field]: enabled, disableStateChangeSound: true,
      });
      const customer = live.find(p => p.callUuid === ctx.session.customer_call_uuid);
      // The transfer XML isolates the customer while preparing. Resume them
      // unless the explicit action was to keep that customer on hold.
      const customerHeld = directControl.role === 'customer' && isHold && enabled;
      if (!customerHeld) await provider(ctx).updateParticipant(customer.memberId, {
        friendlyName: row.mpc_name, hold: false, disableStateChangeSound: true,
      });
      const confirmed = await participants(ctx, row);
      if (!confirmed.some(p => p.callUuid === targetUuid && p[field] === enabled) ||
          !confirmed.some(p => p.callUuid === ctx.session.customer_call_uuid && p.hold === customerHeld)) {
        throw new ConsultationError('Call control could not be confirmed. Please check the call status.');
      }
      row = await patch(ctx, { phase: 'active', data: { held_members: [], last_error: '' } }, ['preparing'], attempt);
      return consultationView(row, confirmed);
    }
    for (const p of held) await provider(ctx).updateParticipant(p.id, { friendlyName: row.mpc_name, hold: true, disableStateChangeSound: true });
    const confirmed = await participants(ctx, row);
    if (held.some(p => !confirmed.some(member => member.memberId === p.id && member.hold))) {
      throw new ConsultationError('Existing caller hold could not be confirmed. No third-person call was placed.');
    }
    row = await patch(ctx, { phase: 'dialing', data: { dial_requested: true } }, ['preparing'], attempt);
    const response = await provider(ctx).addParticipant('customer', {
      friendlyName: row.mpc_name, from: ctx.config.fromNumber, to: dialTo,
      dialMusic: 'real', ringTimeout: 35, hold: false, stayAlone: true,
      startMpcOnEnter: true, endMpcOnExit: false, enterSound: 'none', exitSound: 'none',
      agentHoldMusicUrl: consultationWebhookUrl(ctx, row, 'hold'), agentHoldMusicMethod: 'GET',
      customerHoldMusicUrl: consultationWebhookUrl(ctx, row, 'hold'), customerHoldMusicMethod: 'GET',
      callStatusCallbackUrl: consultationWebhookUrl(ctx, row, 'call', 'guest', attempt), callStatusCallbackMethod: 'POST',
      statusCallbackUrl: consultationWebhookUrl(ctx, row, 'events', 'guest', attempt), statusCallbackMethod: 'POST',
      statusCallbackEvents: 'mpc-state-changes,participant-state-changes,add-participant-api-events',
      onExitActionUrl: consultationWebhookUrl(ctx, row, 'exit', 'guest', attempt), onExitActionMethod: 'POST',
    });
    const call = response?.calls?.[0] || {};
    // Terminal callbacks can arrive before this API response. Record request
    // identifiers without reversing an already completed Cancel/resume.
    const requestId = call.requestUuid || call.request_uuid || response?.requestUuid || response?.request_uuid;
    const guestId = call.callUuid || call.call_uuid;
    row = await patch(ctx, { data: {
      dial_finished: true,
      ...(requestId ? { guest_request_uuid: requestId } : {}),
      ...(guestId ? { guest_call_uuid: guestId } : {}),
    } }, ['dialing', 'ringing', 'consulting', 'cancelling', 'failed', 'active'], attempt);
    if (row.phase === 'cancelling') row = await cancelGuest(ctx, row);
    return consultationView(row, await participants(ctx, row));
  } catch (error) {
    const current = await loadConsultation(ctx.db, ctx.session.id);
    if (current?.attempt_id === attempt && !['ended', 'active', 'merged'].includes(current.phase)) {
      try {
        const rejected = Number(error.statusCode) >= 400 && Number(error.statusCode) < 500;
        const failed = await patch(ctx, { data: { last_error: error.message, dial_finished: true,
          ...(rejected && current.data.dial_requested && !current.data.guest_call_uuid ? { guest_terminal: true } : {}),
        } }, BUSY.concat('failed'), attempt);
        await cancelGuest(ctx, failed, error.message);
      } catch {
        await patch(ctx, { phase: 'failed', data: { last_error: directControl
          ? 'Call controls could not complete. Use Cancel & Resume to recover the call.'
          : 'Add Call could not complete. Use Cancel to resume the existing caller.' } }, BUSY.concat('failed'), attempt);
      }
      if (!transferAccepted && Number(error.statusCode || error.status) >= 400 && Number(error.statusCode || error.status) < 500) {
        await ctx.db.from('call_sessions').update({ conference_name: null }).eq('id', ctx.session.id).eq('conference_name', row.mpc_name);
        await patch(ctx, { phase: 'active', data: { held_members: [] } }, ['preparing', 'cancelling', 'failed', 'active'], attempt);
      }
    }
    throw error;
  }
}

export async function prepareCallControls(ctx, role, action, baseUrl, options = {}) {
  if (!['agent', 'customer'].includes(role) || !['hold', 'unhold', 'mute', 'unmute'].includes(action)) {
    throw new ConsultationError('Invalid call control.', 400);
  }
  if (isConsultationSession(ctx.session)) {
    const row = await loadConsultation(ctx.db, ctx.session.id);
    if (!row || row.phase === 'ended') throw new ConsultationError('No active call controls.');
    const uuid = role === 'agent' ? ctx.session.agent_call_uuid : ctx.session.customer_call_uuid;
    const member = (await participants(ctx, row)).find(p => p.callUuid === uuid);
    if (!member) throw new ConsultationError('Participant not found.', 404);
    return consultationAction(ctx, action, { memberId: member.memberId, attemptId: row.attempt_id });
  }
  return startConsultation(ctx, null, baseUrl, { ...options, directControl: { role, action } });
}

export async function consultationAction(ctx, action, body = {}) {
  let row = await loadConsultation(ctx.db, ctx.session.id);
  if (!row || row.phase === 'ended') throw new ConsultationError('No active consultation.');
  if (body.attemptId && body.attemptId !== row.attempt_id) throw new ConsultationError('This consultation has changed.');
  if (action === 'cancel') {
    if (!['active', 'merged'].includes(row.phase)) row = await cancelGuest(ctx, row);
    return consultationView(row, await participants(ctx, row));
  }
  if (action === 'merge') {
    row = await patch(ctx, { phase: 'merging' }, ['consulting'], row.attempt_id);
    try {
      const live = await participants(ctx, row);
      if (!live.some(p => p.callUuid === row.data.guest_call_uuid)) throw new ConsultationError('Third person is no longer connected.');
      for (const p of row.data.held_members || []) {
        await provider(ctx).updateParticipant(p.id, { friendlyName: row.mpc_name, hold: p.hold, disableStateChangeSound: true });
      }
      const confirmed = await participants(ctx, row);
      if (!confirmed.some(p => p.callUuid === row.data.guest_call_uuid) ||
          (row.data.held_members || []).some(previous =>
            confirmed.some(p => p.memberId === previous.id && p.hold !== previous.hold))) {
        throw new ConsultationError('Merge could not be confirmed. Please cancel or retry.');
      }
      row = await patch(ctx, { phase: 'merged', data: { held_members: [], last_error: '' } }, ['merging'], row.attempt_id);
    } catch (error) {
      // Re-isolate callers after a partial merge failure before retry/cancel.
      if (row.data.guest_member_id) {
        try { await provider(ctx).updateParticipant(row.data.guest_member_id, { friendlyName: row.mpc_name, mute: true, disableStateChangeSound: true }); }
        catch { /* Cancel will remove the guest if provider controls are unavailable. */ }
      }
      for (const p of row.data.held_members || []) {
        try { await provider(ctx).updateParticipant(p.id, { friendlyName: row.mpc_name, hold: true, disableStateChangeSound: true }); } catch { /* Keep failed state visible. */ }
      }
      await patch(ctx, { phase: 'failed', data: { last_error: error.message } }, ['merging'], row.attempt_id);
      throw error;
    }
  } else if (['mute', 'unmute', 'hold', 'unhold', 'kick'].includes(action)) {
    if (BUSY.includes(row.phase) || row.phase === 'failed') throw new ConsultationError('Finish Merge or Cancel before changing participant controls.');
    const live = await participants(ctx, row), member = live.find(p => p.memberId === String(body.memberId));
    if (!member) throw new ConsultationError('Participant not found.', 404);
    if (action === 'kick') await provider(ctx).kickParticipant(member.memberId, { friendlyName: row.mpc_name });
    else await provider(ctx).updateParticipant(member.memberId, {
      friendlyName: row.mpc_name,
      ...(['hold', 'unhold'].includes(action) ? { hold: action === 'hold' } : { mute: action === 'mute' }),
      disableStateChangeSound: true,
    });
    // A retry must not leave an old setup error visible after a successful
    // control. Clear it only after the provider confirms the requested state.
    if (row.data.last_error) {
      const confirmed = await participants(ctx, row);
      const target = confirmed.find(p => p.memberId === member.memberId);
      const field = ['hold', 'unhold'].includes(action) ? 'hold' : 'mute';
      const succeeded = action === 'kick' ? !target :
        target && target[field] === ['hold', 'mute'].includes(action);
      if (succeeded) row = await patch(ctx, { data: { last_error: '' } }, ['active', 'merged'], row.attempt_id);
    }
  } else if (action !== 'merge') throw new ConsultationError('Unknown call action.', 400);
  return consultationView(row, await participants(ctx, row));
}

export async function consultationStatus(ctx) {
  let row = await loadConsultation(ctx.db, ctx.session.id);
  if (!row) return null;
  if (row.phase === 'ended' || !isConsultationSession(ctx.session)) return consultationView(row);
  let live;
  try { live = await participants(ctx, row); }
  catch (error) {
    if (Number(error.statusCode || error.status) !== 404 || !['active', 'merged'].includes(row.phase)) throw error;
    await endConsultation(ctx, 'conference_ended');
    return consultationView(await loadConsultation(ctx.db, ctx.session.id));
  }
  const guest = live.find(p => p.callUuid === row.data.guest_call_uuid || !(row.data.baseline_call_uuids || []).includes(p.callUuid));
  if (['dialing', 'ringing'].includes(row.phase) && guest) {
    row = await patch(ctx, { phase: 'consulting', data: { guest_call_uuid: guest.callUuid, guest_member_id: guest.memberId } }, ['dialing', 'ringing'], row.attempt_id);
  } else if (row.phase === 'cancelling') row = await cancelGuest(ctx, row);
  else if (row.phase === 'consulting' && !guest) row = await cancelGuest(ctx, row, 'Third person disconnected. Existing caller resumed.');
  else if (['preparing', 'dialing', 'ringing'].includes(row.phase) && Date.now() - Date.parse(row.data.started_at) > 50000) {
    row = await cancelGuest(ctx, row, 'Third person did not connect. Existing caller resumed.');
  }
  return consultationView(row, await participants(ctx, row));
}

export async function endConsultation(ctx, cause = 'agent_hangup') {
  const row = await loadConsultation(ctx.db, ctx.session.id);
  if (!row) return;
  const endTime = new Date(), answered = ctx.session.customer_answer_time;
  const { error } = await ctx.db.from('call_sessions').update({
    status: 'ended', hangup_cause: cause, hangup_source: cause === 'agent_hangup' ? 'agent' : 'customer',
    end_time: endTime.toISOString(),
    ...(answered ? { talk_duration_sec: Math.max(0, Math.floor((endTime - new Date(answered)) / 1000)) } : {}),
  }).eq('id', ctx.session.id).in('status', CONNECTED);
  storageError(error);
  await patch(ctx, { phase: 'ended', data: { held_members: [] } });
  try { await provider(ctx).stop({ friendlyName: row.mpc_name }); } catch { /* May already be ended. */ }
  if (row.data.guest_request_uuid) {
    try { await ctx.client.calls.cancel(row.data.guest_request_uuid); } catch { /* Answered calls are stopped by the MPC. */ }
  }
  // Also covers an interrupted transfer where one original leg did not join
  // the MPC. Target only this session's two original calls.
  for (const uuid of [ctx.session.agent_call_uuid, ctx.session.customer_call_uuid]) {
    if (uuid) { try { await ctx.client.calls.hangup(uuid); } catch { /* Already disconnected. */ } }
  }
}

export async function consultationEvent(ctx, event, meta = {}) {
  let row = await loadConsultation(ctx.db, ctx.session.id);
  if (!row || row.phase === 'ended') return;
  if (meta.attempt && meta.attempt !== row.attempt_id) return;
  const name = event.EventName || event.Event || '', callUuid = event.ParticipantCallUUID || event.CallUUID || '';
  const mpcName = event.MPCName || event.MPCFriendlyName;
  if (mpcName && mpcName !== row.mpc_name) throw new ConsultationError('Wrong call callback.', 403);
  if (meta.mode === 'record') {
    if (event.RecordUrl || event.RecordingUrl) await ctx.db.from('call_sessions').update({ recording_url: event.RecordUrl || event.RecordingUrl }).eq('id', ctx.session.id);
    return;
  }
  if (name === 'MPCEnd') { await endConsultation(ctx, row.data.ended_by || 'agent_hangup'); return; }
  const status = String(event.CallStatus || '').toLowerCase();
  const terminal = name === 'ParticipantExit' || ['completed', 'failed', 'busy', 'no-answer', 'cancelled', 'canceled', 'hangup'].includes(status);
  if ([row.data.agent_call_uuid, row.data.customer_call_uuid].includes(callUuid)) {
    // Original Dial callbacks can finish during transfer. MPC participant exit
    // or a real final CDR is required before treating those as a call end.
    if (terminal && name !== 'ParticipantExit') {
      const cdr = await ctx.client.calls.get(callUuid);
      if (!cdr?.endTime) return;
    }
    if (terminal) {
      if (callUuid === row.data.agent_call_uuid) await endConsultation(ctx, 'agent_hangup');
      else {
        const live = await participants(ctx, row);
        if (live.filter(p => p.callUuid !== callUuid).length <= 1) await endConsultation(ctx, 'customer_hangup');
      }
    }
    return;
  }
  if (meta.role !== 'guest' && callUuid !== row.data.guest_call_uuid && name !== 'ParticipantJoin') return;
  if (callUuid && (row.data.baseline_call_uuids || []).includes(callUuid)) return;
  const fields = callUuid ? { guest_call_uuid: callUuid } : {};
  if (terminal && ['preparing', 'dialing', 'ringing', 'consulting', 'cancelling', 'merging', 'failed'].includes(row.phase)) {
    row = await patch(ctx, { data: { ...fields, guest_terminal: true,
      provider_code: event.HangupCauseCode || event.CallHangupCauseCode || null } }, undefined, row.attempt_id);
    if (row.phase !== 'merging') await cancelGuest(ctx, row, `Third person disconnected${row.data.provider_code ? ` (Plivo ${row.data.provider_code})` : ''}.`);
  } else if (name === 'ParticipantJoin' && ['dialing', 'ringing', 'cancelling'].includes(row.phase)) {
    row = await patch(ctx, { ...(row.phase === 'cancelling' ? {} : { phase: 'consulting' }),
      data: { ...fields, guest_member_id: String(event.MemberID || '') } }, ['dialing', 'ringing', 'cancelling'], row.attempt_id);
    if (row.phase === 'cancelling') await cancelGuest(ctx, row);
  } else if (status === 'ringing' && row.phase === 'dialing') {
    await patch(ctx, { phase: 'ringing', data: fields }, ['dialing'], row.attempt_id);
  }
}
