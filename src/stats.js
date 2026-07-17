import { listUserRecords, getRenderStats, incrementRenderStats } from './kv.js';
import { errorResponse, jsonResponse } from './errors.js';
import { safeJson } from './util.js';

export async function handleStats(request, env) {
  const users = await listUserRecords(env);
  const totalUsers = users.length;
  const premiumUsers = users.filter((u) => u.tier === 'premium').length;
  const render = await getRenderStats(env);
  const renderSuccessPct = render.total > 0 ? Math.round((render.success / render.total) * 100) : 0;

  return jsonResponse({ totalUsers, premiumUsers, renderSuccessPct }, 200);
}

export async function handleRenderStatsReport(request, env) {
  const body = await safeJson(request);
  const outcome = body && typeof body.outcome === 'string' ? body.outcome : null;
  if (!['success', 'failed'].includes(outcome)) {
    return errorResponse('VALIDATION_ERROR', 'A valid outcome (success or failed) is required.', 400);
  }
  await incrementRenderStats(env, outcome);
  return jsonResponse({ ok: true }, 200);
}
