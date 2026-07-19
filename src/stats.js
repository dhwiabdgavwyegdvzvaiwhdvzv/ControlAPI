import { listUserRecords, getRenderStats, incrementRenderStats, getSiteSetting, setSiteSetting, getReviewIndex, getReview } from './kv.js';
import { resolveAdminSession } from './session.js';
import { errorResponse, jsonResponse } from './errors.js';
import { safeJson } from './util.js';

const STATS_OVERRIDE_KEY = 'stats_override';

async function computeAutoStats(env) {
  const users = await listUserRecords(env);
  const totalUsers = users.length;
  const premiumUsers = users.filter((u) => u.tier === 'premium').length;
  const render = await getRenderStats(env);
  const renderSuccessPct = render.total > 0 ? Math.round((render.success / render.total) * 100) : 0;

  const approvedIds = await getReviewIndex(env, 'approved');
  const approvedReviews = (await Promise.all(approvedIds.map((id) => getReview(env, id)))).filter(Boolean);
  const rating = approvedReviews.length
    ? Math.round((approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length) * 10) / 10
    : 5;

  return { totalUsers, premiumUsers, renderSuccessPct, rating };
}

export async function handleStats(request, env) {
  const auto = await computeAutoStats(env);
  const override = (await getSiteSetting(env, STATS_OVERRIDE_KEY)) || {};

  return jsonResponse({
    totalUsers: override.totalUsers != null ? override.totalUsers : auto.totalUsers,
    premiumUsers: override.premiumUsers != null ? override.premiumUsers : auto.premiumUsers,
    renderSuccessPct: override.renderSuccessPct != null ? override.renderSuccessPct : auto.renderSuccessPct,
    rating: override.rating != null ? override.rating : auto.rating,
    auto,
    overridden: {
      totalUsers: override.totalUsers != null,
      premiumUsers: override.premiumUsers != null,
      renderSuccessPct: override.renderSuccessPct != null,
      rating: override.rating != null
    }
  }, 200);
}

export async function handleAdminGetStatsOverride(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) return errorResponse('FORBIDDEN', 'Admin access required.', 403);

  const auto = await computeAutoStats(env);
  const override = (await getSiteSetting(env, STATS_OVERRIDE_KEY)) || {};
  return jsonResponse({ auto, override }, 200);
}

const OVERRIDE_FIELDS = {
  totalUsers: { min: 0, max: Infinity, round: (v) => Math.round(v) },
  premiumUsers: { min: 0, max: Infinity, round: (v) => Math.round(v) },
  renderSuccessPct: { min: 0, max: 100, round: (v) => Math.round(v) },
  rating: { min: 0, max: 5, round: (v) => Math.round(v * 10) / 10 }
};

export async function handleAdminSetStatsOverride(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) return errorResponse('FORBIDDEN', 'Admin access required.', 403);

  const body = await safeJson(request);
  const override = {};

  for (const field of Object.keys(OVERRIDE_FIELDS)) {
    const raw = body ? body[field] : undefined;
    if (raw === undefined || raw === null || raw === '') continue;
    const { min, max, round } = OVERRIDE_FIELDS[field];
    const num = Number(raw);
    if (!Number.isFinite(num) || num < min || num > max) {
      return errorResponse('VALIDATION_ERROR', 'Invalid value for ' + field + '.', 400);
    }
    override[field] = round(num);
  }

  await setSiteSetting(env, STATS_OVERRIDE_KEY, override);
  return jsonResponse({ ok: true, override }, 200);
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
