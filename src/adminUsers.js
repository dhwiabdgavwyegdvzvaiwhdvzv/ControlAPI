import { resolveAdminSession } from './session.js';
import { getUser, updateUser, listUserRecords } from './kv.js';
import { createPasswordHash, verifyPassword } from './crypto.js';
import { errorResponse, jsonResponse } from './errors.js';
import { safeJson, isValidUsername, isValidNewPassword, normalizeUsername } from './util.js';

function adminGuardResponse(reason) {
  if (reason === 'not_admin') return errorResponse('FORBIDDEN', 'Admin access required.', 403);
  return errorResponse('INVALID_SESSION', 'Your session is invalid or has expired. Please log in again.', 401);
}

function publicUserView(record) {
  return {
    username: record.username,
    tier: record.tier,
    role: record.role,
    status: record.status,
    telegramId: record.telegramId || null,
    createdAt: record.createdAt || null
  };
}

export async function handleAdminListUsers(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) return adminGuardResponse(admin.reason);

  const records = await listUserRecords(env);
  records.sort((a, b) => (a.username > b.username ? 1 : -1));
  return jsonResponse({ users: records.map(publicUserView) }, 200);
}

export async function handleAdminCreateUser(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) return adminGuardResponse(admin.reason);

  const body = await safeJson(request);
  const rawUsername = body && typeof body.username === 'string' ? body.username : '';
  const password = body && typeof body.password === 'string' ? body.password : '';
  const tier = body && body.tier === 'free' ? 'free' : 'premium';
  const role = body && body.role === 'admin' ? 'admin' : 'user';
  const username = normalizeUsername(rawUsername);

  if (!isValidUsername(username) || !isValidNewPassword(password)) {
    return errorResponse('VALIDATION_ERROR', 'A valid username (3-64 chars) and password (8+ chars) are required.', 400);
  }

  const existing = await getUser(env, username);
  if (existing) {
    return errorResponse('USERNAME_TAKEN', 'That username is already in use.', 409);
  }

  const passwordHash = await createPasswordHash(password);
  const record = {
    username,
    passwordHash,
    tier,
    role,
    status: 'active',
    telegramId: null,
    createdAt: new Date().toISOString()
  };
  await updateUser(env, username, record);

  return jsonResponse({ ok: true, user: publicUserView(record) }, 200);
}

export async function handleAdminSetUserStatus(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) return adminGuardResponse(admin.reason);

  const body = await safeJson(request);
  const username = body && typeof body.username === 'string' ? normalizeUsername(body.username) : null;
  const status = body && (body.status === 'active' || body.status === 'disabled') ? body.status : null;

  if (!username || !status) {
    return errorResponse('VALIDATION_ERROR', 'A username and status ("active" or "disabled") are required.', 400);
  }
  if (username === admin.user.username && status === 'disabled') {
    return errorResponse('VALIDATION_ERROR', 'You cannot disable your own account.', 400);
  }

  const record = await getUser(env, username);
  if (!record) return errorResponse('NOT_FOUND', 'No such user.', 404);

  record.status = status;
  await updateUser(env, username, record);

  return jsonResponse({ ok: true, user: publicUserView(record) }, 200);
}

export async function handleAdminResetPassword(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) return adminGuardResponse(admin.reason);

  const body = await safeJson(request);
  const username = body && typeof body.username === 'string' ? normalizeUsername(body.username) : null;
  const newPassword = body && typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!username || !isValidNewPassword(newPassword)) {
    return errorResponse('VALIDATION_ERROR', 'A username and a new password (8+ chars) are required.', 400);
  }

  const record = await getUser(env, username);
  if (!record) return errorResponse('NOT_FOUND', 'No such user.', 404);

  const sameAsCurrent = await verifyPassword(newPassword, record.passwordHash);
  if (sameAsCurrent) {
    return errorResponse('VALIDATION_ERROR', 'New password must be different from the current one.', 400);
  }

  record.passwordHash = await createPasswordHash(newPassword);
  await updateUser(env, username, record);

  return jsonResponse({ ok: true }, 200);
}
