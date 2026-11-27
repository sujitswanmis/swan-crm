import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAdminClient } from '@/utils/supabase/adminClient';

const TOKEN_STORE_PRIMARY = path.join(process.cwd(), 'src', 'config', 'push_tokens_store.json');
const TOKEN_STORE_TMP = '/tmp/spc_push_tokens_store.json';

let cachedAccessToken = null;
let cachedTokenExpiresAt = 0;

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) return null;
  const trimmed = String(raw).trim();
  try {
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed);
    }
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

async function readLocalTokenStore() {
  for (const p of [TOKEN_STORE_PRIMARY, TOKEN_STORE_TMP]) {
    try {
      const txt = await fs.readFile(p, 'utf8');
      const parsed = JSON.parse(txt || '{}');
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }
  return {};
}

async function writeLocalTokenStore(store) {
  const payload = JSON.stringify(store, null, 2);
  for (const p of [TOKEN_STORE_PRIMARY, TOKEN_STORE_TMP]) {
    try {
      await fs.writeFile(p, payload, 'utf8');
      return true;
    } catch {}
  }
  return false;
}

function isMissingRelationError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return ['PGRST205', '42P01', 'PGRST202'].includes(code) || msg.includes('user_push_tokens');
}

export async function saveUserPushToken({
  userId,
  company = 'TNT00001',
  platform = 'android',
  fcmToken,
  appVersionCode = null,
  deviceModel = null
}) {
  if (!userId || !fcmToken) return { success: false, error: 'userId and fcmToken required' };
  const nowIso = new Date().toISOString();
  const row = {
    user_id: String(userId).trim(),
    company: String(company || 'TNT00001').trim(),
    platform: String(platform || 'android').trim().toLowerCase(),
    fcm_token: String(fcmToken).trim(),
    app_version_code: Number.isFinite(Number(appVersionCode)) ? Number(appVersionCode) : null,
    device_model: deviceModel ? String(deviceModel).slice(0, 120) : null,
    is_active: true,
    updated_at: nowIso
  };

  let persistedDb = false;
  try {
    const admin = getAdminClient();
    if (admin) {
      const { error } = await admin
        .from('user_push_tokens')
        .upsert(row, { onConflict: 'user_id,fcm_token' });
      if (!error) {
        persistedDb = true;
      } else if (!isMissingRelationError(error)) {
        console.warn('[fcmPushSender] DB upsert warning:', error.message);
      }
    }
  } catch {}

  try {
    const store = await readLocalTokenStore();
    const list = Array.isArray(store[row.user_id]) ? store[row.user_id] : [];
    const filtered = list.filter((item) => item?.fcm_token !== row.fcm_token);
    filtered.unshift(row);
    store[row.user_id] = filtered.slice(0, 10);
    await writeLocalTokenStore(store);
  } catch {}

  return { success: true, persistedDb };
}

async function deactivatePushToken(userId, fcmToken) {
  try {
    const admin = getAdminClient();
    if (admin) {
      await admin
        .from('user_push_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('fcm_token', fcmToken);
    }
  } catch {}

  try {
    const store = await readLocalTokenStore();
    if (Array.isArray(store[userId])) {
      store[userId] = store[userId].filter((item) => item?.fcm_token !== fcmToken);
      await writeLocalTokenStore(store);
    }
  } catch {}
}

async function fetchTokensForUsers(userIds = []) {
  const uniqueIds = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const tokenMap = new Map();
  try {
    const admin = getAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from('user_push_tokens')
        .select('user_id, fcm_token')
        .in('user_id', uniqueIds)
        .eq('is_active', true);
      if (!error && Array.isArray(data)) {
        for (const r of data) {
          if (r?.fcm_token) {
            tokenMap.set(`${r.user_id}::${r.fcm_token}`, { userId: r.user_id, fcmToken: r.fcm_token });
          }
        }
      }
    }
  } catch {}

  try {
    const store = await readLocalTokenStore();
    for (const uid of uniqueIds) {
      const list = Array.isArray(store[uid]) ? store[uid] : [];
      for (const item of list) {
        if (item?.fcm_token && item?.is_active !== false) {
          tokenMap.set(`${uid}::${item.fcm_token}`, { userId: uid, fcmToken: item.fcm_token });
        }
      }
    }
  } catch {}

  return [...tokenMap.values()];
}

async function getFirebaseAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && now < cachedTokenExpiresAt - 300) {
    return cachedAccessToken;
  }

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claimSet = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })).toString('base64url');

  const unsignedJwt = `${header}.${claimSet}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key, 'base64url');
  const assertion = `${unsignedJwt}.${signature}`;

  const tokenResp = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }),
    cache: 'no-store'
  });

  if (!tokenResp.ok) {
    const errText = await tokenResp.text().catch(() => '');
    throw new Error(`Firebase OAuth failed (${tokenResp.status}): ${errText.slice(0, 200)}`);
  }

  const tokenJson = await tokenResp.json();
  cachedAccessToken = tokenJson.access_token;
  cachedTokenExpiresAt = now + Number(tokenJson.expires_in || 3600);
  return cachedAccessToken;
}

export async function sendFcmPushToUsers(userIds = [], { title = 'SPC Workspace', body = '', data = {} } = {}) {
  try {
    const serviceAccount = parseServiceAccount();
    if (!serviceAccount?.project_id || !serviceAccount?.client_email || !serviceAccount?.private_key) {
      return { success: false, skipped: true, reason: 'FIREBASE_SERVICE_ACCOUNT_JSON not configured' };
    }

    const targets = await fetchTokensForUsers(userIds);
    if (!targets.length) {
      return { success: true, sent: 0, failed: 0, reason: 'No registered FCM tokens' };
    }

    const accessToken = await getFirebaseAccessToken(serviceAccount);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;

    const stringData = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (v !== undefined && v !== null) stringData[String(k)] = String(v);
    }
    stringData.title = String(title || 'SPC Workspace');
    stringData.body = String(body || '');

    let sent = 0;
    let failed = 0;

    // Send in bounded parallel batches of 15
    for (let i = 0; i < targets.length; i += 15) {
      const slice = targets.slice(i, i + 15);
      await Promise.all(slice.map(async ({ userId, fcmToken }) => {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: {
                token: fcmToken,
                notification: {
                  title: String(title || 'SPC Workspace').slice(0, 120),
                  body: String(body || '').slice(0, 500)
                },
                data: stringData,
                android: {
                  priority: 'HIGH',
                  notification: {
                    channel_id: 'spc_workspace_alerts',
                    sound: 'default'
                  }
                }
              }
            }),
            cache: 'no-store'
          });

          if (res.ok) {
            sent += 1;
          } else {
            failed += 1;
            const errJson = await res.json().catch(() => null);
            const errCode = errJson?.error?.details?.[0]?.errorCode || errJson?.error?.status || '';
            if (res.status === 404 || errCode === 'UNREGISTERED' || errCode === 'INVALID_ARGUMENT') {
              await deactivatePushToken(userId, fcmToken);
            }
          }
        } catch {
          failed += 1;
        }
      }));
    }

    return { success: true, sent, failed, totalTargets: targets.length };
  } catch (err) {
    console.warn('[fcmPushSender] Non-blocking dispatch warning:', err?.message || err);
    return { success: false, error: err?.message || 'Push dispatch failed' };
  }
}
