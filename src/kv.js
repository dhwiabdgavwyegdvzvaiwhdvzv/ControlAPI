

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export async function getUser(env, username) {
  const raw = await env.USERS_KV.get('user:' + username);
  return safeParse(raw);
}

export async function updateUser(env, username, record) {
  await env.USERS_KV.put('user:' + username, JSON.stringify(record));
}

export async function getPasswordMeta(env, username) {
  const raw = await env.USERS_KV.get('pwmeta:' + username);
  return safeParse(raw);
}

export async function setPasswordMeta(env, username, record) {
  await env.USERS_KV.put('pwmeta:' + username, JSON.stringify(record));
}

export async function appendPasswordChangeLog(env, username, entry) {
  const key = 'pwlog:' + username + ':' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await env.USERS_KV.put(key, JSON.stringify(entry));
}

export const MIN_SESSION_TTL_SECONDS = 60;

export async function createSession(env, token, record, ttlSeconds) {
  const clamped = Math.max(MIN_SESSION_TTL_SECONDS, ttlSeconds);
  await env.SESSIONS_KV.put('session:' + token, JSON.stringify(record), {
    expirationTtl: clamped
  });
}

export async function getSession(env, token) {
  const raw = await env.SESSIONS_KV.get('session:' + token);
  return safeParse(raw);
}

export async function deleteSession(env, token) {
  await env.SESSIONS_KV.delete('session:' + token);
}

export async function addUserSessionIndex(env, username, token) {
  const key = 'user_sessions:' + username;
  const list = safeParse(await env.SESSIONS_KV.get(key)) || [];
  list.push(token);
  await env.SESSIONS_KV.put(key, JSON.stringify(list));
}

export async function removeUserSessionIndex(env, username, token) {
  const key = 'user_sessions:' + username;
  const list = safeParse(await env.SESSIONS_KV.get(key));
  if (!list) return;
  await env.SESSIONS_KV.put(key, JSON.stringify(list.filter((t) => t !== token)));
}

export async function revokeAllUserSessions(env, username) {
  const key = 'user_sessions:' + username;
  const tokens = safeParse(await env.SESSIONS_KV.get(key));
  if (!tokens || !tokens.length) {
    await env.SESSIONS_KV.delete(key);
    return;
  }
  await Promise.all(tokens.map((t) => env.SESSIONS_KV.delete('session:' + t)));
  await env.SESSIONS_KV.delete(key);
}

export async function getDeviceLock(env, username) {
  const raw = await env.DEVICES_KV.get('device_by_user:' + username);
  return safeParse(raw);
}

export async function setDeviceLock(env, username, deviceId) {
  await env.DEVICES_KV.put('device_by_user:' + username, JSON.stringify({ deviceId }));
}

export async function getDevice(env, deviceId) {
  const raw = await env.DEVICES_KV.get('device:' + deviceId);
  return safeParse(raw);
}

export async function setDevice(env, deviceId, record) {
  await env.DEVICES_KV.put('device:' + deviceId, JSON.stringify(record));
}

export async function getTrialCredit(env, deviceId) {
  const raw = await env.DEVICES_KV.get('trial:' + deviceId);
  return safeParse(raw);
}

export async function setTrialCredit(env, deviceId, record) {
  await env.DEVICES_KV.put('trial:' + deviceId, JSON.stringify(record));
}

export async function getTelegramLock(env, lockKey) {
  const raw = await env.DEVICES_KV.get('trial_tid:' + lockKey);
  return safeParse(raw);
}

export async function setTelegramLock(env, lockKey, record) {
  await env.DEVICES_KV.put('trial_tid:' + lockKey, JSON.stringify(record));
}

export async function getPremiumTid(env, username) {
  const raw = await env.USERS_KV.get('premium_tid:' + username);
  return safeParse(raw);
}

export async function setPremiumTid(env, username, record) {
  await env.USERS_KV.put('premium_tid:' + username, JSON.stringify(record));
}

export function monthKey(date) {
  const d = date || new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

export async function getPremiumUsage(env, username) {
  const raw = await env.USERS_KV.get('premium_usage:' + username + ':' + monthKey());
  const rec = safeParse(raw);
  return rec ? rec.used : 0;
}

export async function incrementPremiumUsage(env, username) {
  const key = 'premium_usage:' + username + ':' + monthKey();
  const raw = await env.USERS_KV.get(key);
  const rec = safeParse(raw) || { used: 0 };
  rec.used += 1;
  await env.USERS_KV.put(key, JSON.stringify(rec));
  return rec.used;
}

export async function getReview(env, id) {
  const raw = await env.USERS_KV.get('review:' + id);
  return safeParse(raw);
}

export async function setReview(env, id, record) {
  await env.USERS_KV.put('review:' + id, JSON.stringify(record));
}

export async function deleteReview(env, id) {
  await env.USERS_KV.delete('review:' + id);
}

export async function getReviewIndex(env, status) {
  const raw = await env.USERS_KV.get('review_index:' + status);
  return safeParse(raw) || [];
}

export async function addToReviewIndex(env, status, id) {
  const list = await getReviewIndex(env, status);
  if (!list.includes(id)) list.push(id);
  await env.USERS_KV.put('review_index:' + status, JSON.stringify(list));
}

export async function removeFromReviewIndex(env, status, id) {
  const list = await getReviewIndex(env, status);
  await env.USERS_KV.put('review_index:' + status, JSON.stringify(list.filter((x) => x !== id)));
}

export async function listUserRecords(env) {
  const list = await env.USERS_KV.list({ prefix: 'user:' });
  const records = await Promise.all(list.keys.map((k) => env.USERS_KV.get(k.name)));
  return records.map(safeParse).filter(Boolean);
}

export async function getRenderStats(env) {
  const raw = await env.USERS_KV.get('stats:renders');
  return safeParse(raw) || { total: 0, success: 0 };
}

export async function incrementRenderStats(env, outcome) {
  const stats = await getRenderStats(env);
  stats.total += 1;
  if (outcome === 'success') stats.success += 1;
  await env.USERS_KV.put('stats:renders', JSON.stringify(stats));
}
