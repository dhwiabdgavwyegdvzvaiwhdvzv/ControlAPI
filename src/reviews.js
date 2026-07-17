import { resolveAdminSession } from './session.js';
import {
  getReview,
  setReview,
  deleteReview,
  getReviewIndex,
  addToReviewIndex,
  removeFromReviewIndex
} from './kv.js';
import { errorResponse, jsonResponse } from './errors.js';
import { safeJson } from './util.js';

const MAX_NAME_LENGTH = 60;
const MAX_TEXT_LENGTH = 500;

function isValidRating(v) {
  return Number.isInteger(v) && v >= 1 && v <= 5;
}

function forbidden() {
  return errorResponse('FORBIDDEN', 'Admin access required.', 403);
}

export async function handleSubmitReview(request, env) {
  const body = await safeJson(request);
  const name = body && typeof body.name === 'string' ? body.name.trim() : '';
  const text = body && typeof body.text === 'string' ? body.text.trim() : '';
  const rating = body && Number.isFinite(body.rating) ? Math.round(body.rating) : null;

  if (!name || name.length > MAX_NAME_LENGTH || !text || text.length > MAX_TEXT_LENGTH || !isValidRating(rating)) {
    return errorResponse('VALIDATION_ERROR', 'A name, review text, and a rating from 1-5 are required.', 400);
  }

  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await setReview(env, id, {
    id,
    name,
    text,
    rating,
    status: 'pending',
    submittedAt: new Date().toISOString()
  });
  await addToReviewIndex(env, 'pending', id);

  return jsonResponse({ ok: true }, 200);
}

export async function handleApprovedReviews(request, env) {
  const ids = await getReviewIndex(env, 'approved');
  const reviews = (await Promise.all(ids.map((id) => getReview(env, id)))).filter(Boolean);
  reviews.sort((a, b) => new Date(b.approvedAt || 0) - new Date(a.approvedAt || 0));
  return jsonResponse({ reviews }, 200);
}

export async function handleAdminPendingReviews(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) return forbidden();
  const ids = await getReviewIndex(env, 'pending');
  const reviews = (await Promise.all(ids.map((id) => getReview(env, id)))).filter(Boolean);
  reviews.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
  return jsonResponse({ reviews }, 200);
}

export async function handleApproveReview(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) return forbidden();

  const body = await safeJson(request);
  const id = body && typeof body.id === 'string' ? body.id : null;
  if (!id) return errorResponse('VALIDATION_ERROR', 'A review id is required.', 400);

  const review = await getReview(env, id);
  if (!review || review.status !== 'pending') {
    return errorResponse('NOT_FOUND', 'No pending review with that id.', 404);
  }

  review.status = 'approved';
  review.approvedAt = new Date().toISOString();
  await setReview(env, id, review);
  await removeFromReviewIndex(env, 'pending', id);
  await addToReviewIndex(env, 'approved', id);

  return jsonResponse({ ok: true }, 200);
}

export async function handleDeleteReview(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) return forbidden();

  const body = await safeJson(request);
  const id = body && typeof body.id === 'string' ? body.id : null;
  if (!id) return errorResponse('VALIDATION_ERROR', 'A review id is required.', 400);

  const review = await getReview(env, id);
  if (!review) return errorResponse('NOT_FOUND', 'No review with that id.', 404);

  await deleteReview(env, id);
  await removeFromReviewIndex(env, 'pending', id);
  await removeFromReviewIndex(env, 'approved', id);

  return jsonResponse({ ok: true }, 200);
}
