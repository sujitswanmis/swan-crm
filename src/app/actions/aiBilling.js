'use server';

import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/adminClient';

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_FORMAT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false
});
const IST_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const MASTER_EMAILS = new Set(['supujacreations@gmail.com', 'admin@newswangroup.com', 'sujitswanmis@gmail.com']);
const cache = new Map();
const norm = value => String(value || '').trim().toLowerCase();

function configKey(workspace) {
  const clean = String(workspace || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return clean ? `ai_config_${clean}` : 'ai_config_default';
}

function period() {
  const now = new Date();
  const parts = Object.fromEntries(IST_PARTS.formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  let providerDayStart = Date.UTC(parts.year, parts.month - 1, parts.day);
  if (parts.hour < 5 || (parts.hour === 5 && parts.minute < 30)) providerDayStart -= DAY_MS;
  const providerDay = new Date(providerDayStart);
  const monthStart = Date.UTC(providerDay.getUTCFullYear(), providerDay.getUTCMonth(), 1);
  return {
    startSeconds: Math.floor(monthStart / 1000),
    endSeconds: Math.floor(now.getTime() / 1000),
    startIso: new Date(monthStart).toISOString(),
    endIso: now.toISOString(),
    dayStart: providerDayStart,
    periodLabel: `${IST_FORMAT.format(new Date(monthStart))} – ${IST_FORMAT.format(now)} IST`
  };
}

function dailyEntry(startMs, endMs, amount) {
  return {
    start: startMs,
    end: endMs,
    label: `${IST_FORMAT.format(new Date(startMs))} – ${IST_FORMAT.format(new Date(endMs))} IST`,
    amount
  };
}

async function fetchPages(url, headers) {
  const buckets = [];
  let nextPage = null;
  for (let page = 0; page < 4; page += 1) {
    const requestUrl = new URL(url);
    if (nextPage) requestUrl.searchParams.set('page', nextPage);
    const response = await fetch(requestUrl, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`Billing provider returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (!Array.isArray(payload?.data)) throw new Error('Billing provider returned an invalid report.');
    buckets.push(...payload.data);
    if (!payload.has_more || !payload.next_page) return buckets;
    nextPage = payload.next_page;
  }
  throw new Error('Billing report exceeded the page limit.');
}

function summarize(buckets, dayStart, amountForBucket) {
  const daily = buckets.map(bucket => {
    const start = typeof bucket.start_time === 'number'
      ? bucket.start_time * 1000 : Date.parse(bucket.starting_at);
    const end = typeof bucket.end_time === 'number'
      ? bucket.end_time * 1000 : Date.parse(bucket.ending_at);
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Billing provider returned an invalid date.');
    return dailyEntry(start, end, amountForBucket(bucket));
  }).sort((a, b) => b.start - a.start);
  return {
    status: 'ready',
    currency: 'USD',
    monthAmount: daily.length ? daily.reduce((sum, day) => sum + day.amount, 0) : null,
    latestDay: daily.find(day => day.start === dayStart) || daily[0] || null,
    daily
  };
}

async function openAiCosts(apiKeyId, window) {
  const url = new URL('https://api.openai.com/v1/organization/costs');
  url.searchParams.set('start_time', String(window.startSeconds));
  url.searchParams.set('end_time', String(window.endSeconds));
  url.searchParams.set('bucket_width', '1d');
  url.searchParams.set('limit', '31');
  url.searchParams.append('api_key_ids[]', apiKeyId);
  const buckets = await fetchPages(url, { Authorization: `Bearer ${process.env.OPENAI_ADMIN_KEY}` });
  return summarize(buckets, window.dayStart, bucket => (bucket.results || []).reduce((sum, result) => {
    const amount = Number(result.amount?.value);
    if (!Number.isFinite(amount)) throw new Error('OpenAI returned an invalid amount.');
    return sum + amount;
  }, 0));
}

async function claudeCosts(workspaceId, window) {
  const url = new URL('https://api.anthropic.com/v1/organizations/cost_report');
  url.searchParams.set('starting_at', window.startIso);
  url.searchParams.set('ending_at', window.endIso);
  url.searchParams.set('bucket_width', '1d');
  url.searchParams.set('limit', '31');
  url.searchParams.append('group_by[]', 'workspace_id');
  const buckets = await fetchPages(url, {
    'x-api-key': process.env.ANTHROPIC_ADMIN_KEY,
    'anthropic-version': '2023-06-01'
  });
  return summarize(buckets, window.dayStart, bucket => (bucket.results || [])
    .filter(result => result.workspace_id === workspaceId)
    .reduce((sum, result) => {
      // Anthropic reports decimal strings in cents, including fractional cents.
      const cents = Number(result.amount);
      if (!Number.isFinite(cents)) throw new Error('Claude returned an invalid amount.');
      return sum + cents / 100;
    }, 0));
}

function readScopes(storageKey) {
  try {
    const all = JSON.parse(process.env.AI_BILLING_SCOPES_JSON || '{}');
    return all && typeof all === 'object' && !Array.isArray(all) ? all[storageKey] || {} : {};
  } catch {
    return {};
  }
}

async function cachedCost(key, loader) {
  const found = cache.get(key);
  if (found && found.expires > Date.now()) return found.value;
  const value = await loader();
  if (cache.size > 100) cache.clear();
  cache.set(key, { value, expires: Date.now() + 5 * 60 * 1000 });
  return value;
}

export async function getAiBillingSummary(workspace) {
  try {
    const session = await createClient();
    const { data: { user }, error: authError } = await session.auth.getUser();
    if (authError || !user) return { success: false, error: 'Please sign in again.' };

    const db = getAdminClient();
    const { data: actor, error: actorError } = await db.from('user_roles')
      .select('role,email,company,tenant_id,module_access,emp_status')
      .eq('user_id', user.id).maybeSingle();
    if (actorError || !actor) return { success: false, error: 'Billing access unavailable.' };
    if (['inactive', 'trash', 'resigned', 'terminated', 'hold', 'suspended', 'deleted', 'draft'].includes(norm(actor.emp_status || actor.module_access?.emp_status))) {
      return { success: false, error: 'Billing access unavailable.' };
    }
    const master = MASTER_EMAILS.has(norm(user.email)) || norm(actor.role) === 'masteradmin' || actor.module_access?.is_master_admin === true;
    if (!master && !['admin', 'superadmin'].includes(norm(actor.role))) {
      return { success: false, error: 'Only workspace admins can view billing.' };
    }
    const requested = norm(workspace);
    const ownWorkspace = [actor.tenant_id, actor.module_access?._tenantId, actor.company].some(value => norm(value) === requested);
    if (!requested || requested.length > 120 || (!master && !ownWorkspace)) {
      return { success: false, error: 'Billing access unavailable for this workspace.' };
    }

    const storageKey = configKey(requested);
    const { data: row, error: configError } = await db.from('global_role_permissions')
      .select('permissions').eq('id', storageKey).maybeSingle();
    if (configError) throw configError;
    const systemKeys = {
      openai: process.env.OPENAI_API_KEY,
      gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY,
      claude: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
    };
    const available = ['openai', 'gemini', 'claude'].map(id => ({
      id,
      workspaceKey: String(row?.permissions?.[id]?.api_key || '').trim().length > 5,
      systemKey: Boolean(systemKeys[id]?.trim())
    })).filter(provider => provider.workspaceKey || provider.systemKey);
    const scopes = readScopes(storageKey);
    const window = period();
    const providers = {};
    await Promise.all(available.map(async ({ id, workspaceKey }) => {
      if (id === 'gemini') {
        providers[id] = { status: 'setup_required', message: 'Gemini cost needs Google Cloud Billing export to BigQuery. A model API key cannot read billed spend.' };
        return;
      }
      if (!workspaceKey) {
        providers[id] = { status: 'setup_required', message: 'This provider uses a system API key. Exact workspace spend needs a dedicated workspace key and billing scope.' };
        return;
      }
      const scopeId = id === 'openai' ? scopes.openai_api_key_id : scopes.claude_workspace_id;
      const adminKey = id === 'openai' ? process.env.OPENAI_ADMIN_KEY : process.env.ANTHROPIC_ADMIN_KEY;
      if (!scopeId || !adminKey) {
        providers[id] = { status: 'setup_required', message: id === 'openai'
          ? 'Connect an OpenAI Admin key and this workspace’s OpenAI API key ID.'
          : 'Connect a Claude Admin key and this workspace’s Claude workspace ID.' };
        return;
      }
      try {
        const cacheKey = `${storageKey}:${id}:${scopeId}:${window.startSeconds}`;
        providers[id] = await cachedCost(cacheKey, () => id === 'openai'
          ? openAiCosts(scopeId, window) : claudeCosts(scopeId, window));
      } catch (error) {
        console.error(`AI billing ${id} failed:`, error);
        providers[id] = { status: 'error', message: 'Provider billing report unavailable. Check billing access and try again.' };
      }
    }));
    return { success: true, providers, periodLabel: window.periodLabel };
  } catch (error) {
    console.error('getAiBillingSummary failed:', error);
    return { success: false, error: 'Billing data unavailable. Try again later.' };
  }
}
