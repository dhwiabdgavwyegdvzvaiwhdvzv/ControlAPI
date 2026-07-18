

import { verifyPassword, createPasswordHash, generateSessionToken, DUMMY_PASSWORD_HASH, timingSafeEqualString } from './crypto.js';
import { verifyTurnstileToken } from './turnstile.js';
import { resolveSession } from './session.js';
import {
  getUser,
  updateUser,
  createSession,
  getSession,
  deleteSession,
  addUserSessionIndex,
  removeUserSessionIndex,
  revokeAllUserSessions,
  MIN_SESSION_TTL_SECONDS,
  getDeviceLock,
  setDeviceLock,
  clearDeviceLock,
  getDevice,
  setDevice,
  getPasswordMeta,
  setPasswordMeta,
  appendPasswordChangeLog,
  getResetAttempts,
  bumpResetAttempts
} from './kv.js';
import { errorResponse, jsonResponse } from './errors.js';
import {
  safeJson,
  getBearerToken,
  getDeviceId,
  isValidUsername,
  isValidPassword,
  isValidNewPassword,
  isValidDeviceId,
  normalizeUsername,
  currentMonthKey
} from './util.js';

const INVALID_LOGIN = () => errorResponse('VALIDATION_ERROR', 'A valid username, password, and deviceId are required.', 400);
const INVALID_CREDENTIALS = () => errorResponse('INVALID_CREDENTIALS', 'Invalid username or password.', 401);
const SESSION_EXPIRED = () => errorResponse('SESSION_EXPIRED', 'Session expired or invalid.', 401);

const TURNSTILE_MESSAGES = {
  missing: 'Please complete the verification challenge.',
  expired: 'Verification expired. Please try again.',
  invalid: 'Verification failed. Please try again.',
  network_error: 'Verification could not be completed. Please try again.'
};
const TURNSTILE_FAILED = (reason) =>
  errorResponse('TURNSTILE_FAILED', TURNSTILE_MESSAGES[reason] || TURNSTILE_MESSAGES.invalid, 403);

const DEVICE_MISMATCH = () =>
  errorResponse('DEVICE_MISMATCH', 'This account is locked to another device. Contact support to reset it.', 403);

const MONTHLY_PASSWORD_CHANGE_LIMIT = 3;

export async function handleLogin(request, env) {
  const body = await safeJson(request);

  const turnstileToken = body && typeof body.turnstileToken === 'string' ? body.turnstileToken : null;
  const remoteIp = request.headers.get('CF-Connecting-IP') || undefined;
  const turnstileResult = await verifyTurnstileToken(turnstileToken, env, remoteIp);
  if (!turnstileResult.success) {
    return TURNSTILE_FAILED(turnstileResult.reason);
  }

  if (!body || !isValidUsername(body.username) || !isValidPassword(body.password) || !isValidDeviceId(body.deviceId)) {
    return INVALID_LOGIN();
  }

  
  
  const headerDeviceId = getDeviceId(request);
  if (headerDeviceId && headerDeviceId !== body.deviceId) {
    return INVALID_LOGIN();
  }

  const username = normalizeUsername(body.username);
  const password = body.password;
  const deviceId = body.deviceId;

  const user = await getUser(env, username);
  if (!user) {
    
    
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return INVALID_CREDENTIALS();
  }
  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    return INVALID_CREDENTIALS();
  }
  if (user.status === 'disabled') {
    return errorResponse('ACCOUNT_DISABLED', 'This account has been disabled. Contact support.', 403);
  }

  
  const lock = await getDeviceLock(env, username);
  const isFirstLoginEver = !lock;
  if (!isFirstLoginEver && lock.deviceId !== deviceId) {
    return errorResponse(
      'DEVICE_MISMATCH',
      'This account is locked to another device. Contact support to reset it.',
      403
    );
  }
  if (isFirstLoginEver) {
    await setDeviceLock(env, username, deviceId);
    
    
    const verify = await getDeviceLock(env, username);
    if (!verify || verify.deviceId !== deviceId) {
      return errorResponse(
        'DEVICE_MISMATCH',
        'This account is locked to another device. Contact support to reset it.',
        403
      );
    }
  }

  const existingDevice = await getDevice(env, deviceId);
  const now = new Date().toISOString();
  await setDevice(env, deviceId, {
    telegramId: existingDevice ? existingDevice.telegramId || null : null,
    linkedUsername: username,
    linkedTier: user.tier,
    lockedAt: isFirstLoginEver ? now : (existingDevice && existingDevice.lockedAt) || now,
    firstSeenAt: (existingDevice && existingDevice.firstSeenAt) || now,
    usage: (existingDevice && existingDevice.usage) || { week: null, count: 0 }
  });

  
  await revokeAllUserSessions(env, username);

  const token = generateSessionToken();
  const ttlSeconds = Math.max(MIN_SESSION_TTL_SECONDS, parseInt(env.SESSION_TTL_SECONDS, 10) || 2592000);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await createSession(env, token, { username, deviceId, issuedAt: now, expiresAt }, ttlSeconds);
  await addUserSessionIndex(env, username, token);

  return jsonResponse(
    { token, expiresAt, tier: user.tier, role: user.role, username: user.username },
    200
  );
}

export async function handleLogout(request, env) {
  const token = getBearerToken(request);
  if (token) {
    const session = await getSession(env, token);
    if (session) {
      await deleteSession(env, token);
      await removeUserSessionIndex(env, session.username, token);
    }
  }
  return jsonResponse({ ok: true }, 200);
}

export async function handleGetSession(request, env) {
  const resolved = await resolveSession(request, env);
  if (!resolved.ok) return SESSION_EXPIRED();

  return jsonResponse(
    {
      username: resolved.user.username,
      tier: resolved.user.tier,
      role: resolved.user.role,
      expiresAt: resolved.session.expiresAt
    },
    200
  );
}

function currentPasswordChangeCount(meta) {
  if (!meta || meta.month !== currentMonthKey()) return 0;
  return meta.count || 0;
}

async function logPasswordChangeAttempt(env, entry) {
  
  try {
    await appendPasswordChangeLog(env, entry.username, entry);
  } catch (err) {
    console.error('Failed to write password-change audit log entry:', err && err.stack ? err.stack : err);
  }
}

export async function handlePasswordStatus(request, env) {
  const resolved = await resolveSession(request, env);
  if (!resolved.ok) return SESSION_EXPIRED();

  const meta = await getPasswordMeta(env, resolved.user.username);
  const used = currentPasswordChangeCount(meta);

  return jsonResponse(
    {
      changesRemaining: Math.max(0, MONTHLY_PASSWORD_CHANGE_LIMIT - used),
      limit: MONTHLY_PASSWORD_CHANGE_LIMIT,
      disabled: !!(meta && meta.disabled)
    },
    200
  );
}

export async function handleChangePassword(request, env) {
  const body = await safeJson(request);

  const turnstileToken = body && typeof body.turnstileToken === 'string' ? body.turnstileToken : null;
  const remoteIp = request.headers.get('CF-Connecting-IP') || undefined;
  const turnstileResult = await verifyTurnstileToken(turnstileToken, env, remoteIp);
  if (!turnstileResult.success) {
    return TURNSTILE_FAILED(turnstileResult.reason);
  }

  const resolved = await resolveSession(request, env);
  if (!resolved.ok) return SESSION_EXPIRED();
  const { user, deviceId } = resolved;

  
  
  const currentLock = await getDeviceLock(env, user.username);
  if (!currentLock || currentLock.deviceId !== deviceId) {
    return DEVICE_MISMATCH();
  }

  const logBase = { username: user.username, deviceId, ip: remoteIp || null, timestamp: new Date().toISOString() };

  const currentPassword = body && typeof body.currentPassword === 'string' ? body.currentPassword : null;
  const newPassword = body && typeof body.newPassword === 'string' ? body.newPassword : null;
  const confirmPassword = body && typeof body.confirmPassword === 'string' ? body.confirmPassword : null;

  if (!currentPassword || !isValidNewPassword(newPassword) || !confirmPassword) {
    await logPasswordChangeAttempt(env, { ...logBase, success: false, reason: 'validation_error' });
    return errorResponse(
      'VALIDATION_ERROR',
      'Current password and a new password (at least 8 characters) are required.',
      400
    );
  }

  if (newPassword !== confirmPassword) {
    await logPasswordChangeAttempt(env, { ...logBase, success: false, reason: 'password_mismatch' });
    return errorResponse('PASSWORD_MISMATCH', 'New password and confirmation do not match.', 400);
  }

  
  const meta = await getPasswordMeta(env, user.username);
  if (meta && meta.disabled) {
    await logPasswordChangeAttempt(env, { ...logBase, success: false, reason: 'changes_disabled' });
    return errorResponse('PASSWORD_CHANGES_DISABLED', 'Password changes are currently disabled for this account. Contact support.', 403);
  }
  const usedThisMonth = currentPasswordChangeCount(meta);
  if (usedThisMonth >= MONTHLY_PASSWORD_CHANGE_LIMIT) {
    await logPasswordChangeAttempt(env, { ...logBase, success: false, reason: 'limit_exceeded' });
    return errorResponse(
      'PASSWORD_CHANGE_LIMIT_EXCEEDED',
      `You've reached the limit of ${MONTHLY_PASSWORD_CHANGE_LIMIT} password changes this month. Try again next month.`,
      429
    );
  }

  const currentPasswordOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentPasswordOk) {
    await logPasswordChangeAttempt(env, { ...logBase, success: false, reason: 'invalid_current_password' });
    return errorResponse('INVALID_CURRENT_PASSWORD', 'Your current password is incorrect.', 401);
  }

  
  const sameAsCurrent = await verifyPassword(newPassword, user.passwordHash);
  if (sameAsCurrent) {
    await logPasswordChangeAttempt(env, { ...logBase, success: false, reason: 'password_reuse' });
    return errorResponse('PASSWORD_REUSE_NOT_ALLOWED', 'New password must be different from your current password.', 400);
  }

  const newHash = await createPasswordHash(newPassword);
  await updateUser(env, user.username, { ...user, passwordHash: newHash });

  const month = currentMonthKey();
  const newCount = usedThisMonth + 1;
  await setPasswordMeta(env, user.username, {
    month,
    count: newCount,
    disabled: !!(meta && meta.disabled),
    lastChangedAt: logBase.timestamp
  });

  
  await revokeAllUserSessions(env, user.username);

  await logPasswordChangeAttempt(env, { ...logBase, success: true, reason: null });

  return jsonResponse(
    { ok: true, changesRemaining: Math.max(0, MONTHLY_PASSWORD_CHANGE_LIMIT - newCount) },
    200
  );
}

const RESET_KEY_MAX_ATTEMPTS = 8;
const RESET_KEY_WINDOW_SECONDS = 900;

export async function handlePasswordResetWithKey(request, env) {
  const remoteIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const attempts = await getResetAttempts(env, remoteIp);
  if (attempts >= RESET_KEY_MAX_ATTEMPTS) {
    return errorResponse('TOO_MANY_ATTEMPTS', 'Too many reset attempts. Try again later.', 429);
  }

  const body = await safeJson(request);

  const turnstileToken = body && typeof body.turnstileToken === 'string' ? body.turnstileToken : null;
  const turnstileResult = await verifyTurnstileToken(turnstileToken, env, remoteIp);
  if (!turnstileResult.success) {
    return TURNSTILE_FAILED(turnstileResult.reason);
  }

  const username = body && typeof body.username === 'string' ? normalizeUsername(body.username) : null;
  const resetKey = body && typeof body.resetKey === 'string' ? body.resetKey : '';
  const newPassword = body && typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!username || !resetKey || !isValidNewPassword(newPassword)) {
    return errorResponse('VALIDATION_ERROR', 'A username, reset key, and new password (8+ chars) are required.', 400);
  }

  const expectedKey = env.ADMIN_RESET_KEY || '';
  if (!expectedKey || !timingSafeEqualString(resetKey, expectedKey)) {
    await bumpResetAttempts(env, remoteIp, RESET_KEY_WINDOW_SECONDS);
    return errorResponse('INVALID_RESET_KEY', 'Incorrect reset key.', 403);
  }

  const record = await getUser(env, username);
  if (!record) {
    await bumpResetAttempts(env, remoteIp, RESET_KEY_WINDOW_SECONDS);
    return errorResponse('NOT_FOUND', 'No such user.', 404);
  }

  record.passwordHash = await createPasswordHash(newPassword);
  await updateUser(env, username, record);
  await clearDeviceLock(env, username);
  await revokeAllUserSessions(env, username);

  return jsonResponse({ ok: true }, 200);
}

export function handleHealth() {
  return jsonResponse({ ok: true }, 200);
}
