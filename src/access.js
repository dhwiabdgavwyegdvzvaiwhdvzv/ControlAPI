

import { resolveSession } from './session.js';
import { verifyTidWithProvider } from './verification.js';
import { isKnownMethod, isPremiumMethod } from './methodPolicy.js';
import { getDeviceLock, getTrialCredit, setTrialCredit, getTelegramLock, setTelegramLock } from './kv.js';
import { errorResponse, jsonResponse } from './errors.js';
import { safeJson, getDeviceId, isValidDeviceId } from './util.js';

const PENDING_TIMEOUT_MS = 30 * 60 * 1000;

function isPendingStale(trial) {
  if (!trial || !trial.pendingSince) return false;
  return Date.now() - new Date(trial.pendingSince).getTime() > PENDING_TIMEOUT_MS;
}

async function resolveCaller(request, env) {
  const hasAuthHeader = !!request.headers.get('Authorization');

  if (hasAuthHeader) {
    const resolved = await resolveSession(request, env);
    if (!resolved.ok) {
      return { ok: false, code: resolved.reason === 'disabled' ? 'ACCOUNT_DISABLED' : 'INVALID_SESSION' };
    }

    const currentLock = await getDeviceLock(env, resolved.user.username);
    if (!currentLock || currentLock.deviceId !== resolved.deviceId) {
      return { ok: false, code: 'DEVICE_MISMATCH' };
    }

    return { ok: true, tier: resolved.user.tier, username: resolved.user.username, deviceId: resolved.deviceId };
  }

  const deviceId = getDeviceId(request);
  if (!isValidDeviceId(deviceId)) return { ok: false, code: 'INVALID_SESSION' };
  return { ok: true, tier: 'free', username: null, deviceId };
}

function callerErrorResponse(code) {
  if (code === 'ACCOUNT_DISABLED') {
    return errorResponse('ACCOUNT_DISABLED', 'This account has been disabled. Contact support.', 403);
  }
  if (code === 'DEVICE_MISMATCH') {
    return errorResponse('DEVICE_MISMATCH', 'This account is locked to another device. Contact support to reset it.', 403);
  }
  return errorResponse('INVALID_SESSION', 'Your session is invalid or has expired. Please log in again.', 401);
}

export async function handleMethodAuthorize(request, env) {
  const body = await safeJson(request);
  const method = body && typeof body.method === 'string' ? body.method : null;
  if (!isKnownMethod(method)) {
    return errorResponse('VALIDATION_ERROR', 'Unknown method.', 400);
  }

  if (!isPremiumMethod(method)) {
    return jsonResponse({ allowed: true, usingTrial: false, tier: null }, 200);
  }

  const caller = await resolveCaller(request, env);
  if (!caller.ok) return callerErrorResponse(caller.code);

  if (caller.tier === 'premium') {
    return jsonResponse({ allowed: true, usingTrial: false, tier: 'premium' }, 200);
  }

  
  const trial = await getTrialCredit(env, caller.deviceId);

  if (trial && trial.pendingMethod && !isPendingStale(trial)) {
    if (trial.pendingMethod === method) {
      
      return jsonResponse({ allowed: true, usingTrial: true, tier: 'free' }, 200);
    }
    return errorResponse(
      'NO_TRIAL_CREDIT',
      'You already have a trial in progress for another method. Finish or cancel it first.',
      403
    );
  }

  if (!trial) {
    return errorResponse(
      'PREMIUM_REQUIRED',
      'This method requires Premium. Verify your Telegram ID for a one-time free trial, or upgrade.',
      403
    );
  }
  if (!trial.credits || trial.credits < 1) {
    return errorResponse('NO_TRIAL_CREDIT', 'You have already used your one-time premium trial.', 403);
  }

  
  await setTrialCredit(env, caller.deviceId, {
    ...trial,
    pendingMethod: method,
    pendingSince: new Date().toISOString()
  });

  return jsonResponse({ allowed: true, usingTrial: true, tier: 'free' }, 200);
}

export async function handleMethodComplete(request, env) {
  const body = await safeJson(request);
  const method = body && typeof body.method === 'string' ? body.method : null;
  const outcome = body && typeof body.outcome === 'string' ? body.outcome : null;

  if (!isKnownMethod(method) || !['success', 'failed', 'cancelled'].includes(outcome)) {
    return errorResponse('VALIDATION_ERROR', 'A known method and outcome (success, failed, or cancelled) are required.', 400);
  }

  if (!isPremiumMethod(method)) {
    return jsonResponse({ ok: true }, 200); 
  }

  const caller = await resolveCaller(request, env);
  if (!caller.ok) return callerErrorResponse(caller.code);

  if (caller.tier === 'premium') {
    return jsonResponse({ ok: true }, 200); 
  }

  const trial = await getTrialCredit(env, caller.deviceId);
  if (!trial || trial.pendingMethod !== method) {
    
    return jsonResponse({ ok: true, creditsRemaining: trial ? trial.credits : 0 }, 200);
  }

  if (outcome === 'success') {
    
    const creditsRemaining = Math.max(0, trial.credits - 1);
    await setTrialCredit(env, caller.deviceId, {
      ...trial,
      credits: creditsRemaining,
      usedAt: new Date().toISOString(),
      pendingMethod: null,
      pendingSince: null
    });
    return jsonResponse({ ok: true, creditsRemaining }, 200);
  }

  
  await setTrialCredit(env, caller.deviceId, { ...trial, pendingMethod: null, pendingSince: null });
  return jsonResponse({ ok: true, creditsRemaining: trial.credits }, 200);
}

export async function handleTidVerify(request, env) {
  const body = await safeJson(request);
  const tid = body && typeof body.tid === 'string' ? body.tid : null;

  const verification = await verifyTidWithProvider(tid);
  if (!verification.valid) {
    return errorResponse('INVALID_TID', 'Please enter a valid Telegram ID or username.', 400);
  }

  const deviceId = getDeviceId(request);
  if (!isValidDeviceId(deviceId)) {
    return errorResponse('VALIDATION_ERROR', 'A valid device is required.', 400);
  }

  const existing = await getTrialCredit(env, deviceId);
  if (existing) {
    return jsonResponse(
      { ok: true, alreadyVerified: true, credits: existing.credits, usedAt: existing.usedAt },
      200
    );
  }

  const tidLock = await getTelegramLock(env, verification.lockKey);
  if (tidLock && tidLock.deviceId !== deviceId) {
    return errorResponse(
      'TID_ALREADY_USED',
      'This Telegram ID has already claimed a trial credit on another device.',
      403
    );
  }

  await setTrialCredit(env, deviceId, {
    tid: verification.normalizedTid,
    credits: 1,
    createdAt: new Date().toISOString(),
    usedAt: null,
    pendingMethod: null,
    pendingSince: null
  });
  await setTelegramLock(env, verification.lockKey, {
    deviceId,
    createdAt: new Date().toISOString()
  });

  return jsonResponse({ ok: true, alreadyVerified: false, credits: 1 }, 200);
}

export async function handleTrialStatus(request, env) {
  const deviceId = getDeviceId(request);
  if (!isValidDeviceId(deviceId)) {
    return errorResponse('VALIDATION_ERROR', 'A valid device is required.', 400);
  }

  const trial = await getTrialCredit(env, deviceId);
  return jsonResponse(
    {
      verified: !!trial,
      credits: trial ? trial.credits : 0,
      usedAt: trial ? trial.usedAt : null,
      pendingMethod: trial ? trial.pendingMethod : null
    },
    200
  );
}
