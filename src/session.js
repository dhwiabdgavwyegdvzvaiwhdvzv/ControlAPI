

import { getSession, getUser } from './kv.js';
import { getBearerToken, getDeviceId, isValidDeviceId, isExpired } from './util.js';

export async function resolveSession(request, env) {
  const token = getBearerToken(request);
  if (!token) return { ok: false, reason: 'no_token' };

  const deviceId = getDeviceId(request);
  if (!isValidDeviceId(deviceId)) return { ok: false, reason: 'invalid_device' };

  const session = await getSession(env, token);
  if (!session) return { ok: false, reason: 'no_session' };
  if (session.deviceId !== deviceId) return { ok: false, reason: 'device_mismatch' };

  const user = await getUser(env, session.username);
  if (!user) return { ok: false, reason: 'no_user' };
  if (user.status === 'disabled') return { ok: false, reason: 'disabled' };
  if (isExpired(user.expiresAt)) return { ok: false, reason: 'expired' };

  return { ok: true, token, deviceId, session, user };
}

export async function resolveAdminSession(request, env) {
  const resolved = await resolveSession(request, env);
  if (!resolved.ok) return resolved;
  if (resolved.user.role !== 'admin') return { ok: false, reason: 'not_admin' };
  return resolved;
}
