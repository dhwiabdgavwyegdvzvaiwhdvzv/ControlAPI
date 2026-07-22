

import { resolveAdminSession } from './session.js';
import { getSiteSetting, setSiteSetting } from './kv.js';
import { errorResponse, jsonResponse } from './errors.js';
import { safeJson } from './util.js';

function adminGuardResponse(reason) {
  if (reason === 'not_admin') return errorResponse('FORBIDDEN', 'Admin access required.', 403);
  return errorResponse('INVALID_SESSION', 'Your session is invalid or has expired. Please log in again.', 401);
}

function parseVideoUrl(rawUrl) {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!url) return null;

  const driveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    const id = driveMatch[1];
    return {
      provider: 'drive',
      watchUrl: 'https://drive.google.com/file/d/' + id + '/view',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + id,
      autoThumbnailUrl: null
    };
  }

  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/);
  if (ytMatch) {
    const id = ytMatch[1];
    return {
      provider: 'youtube',
      watchUrl: 'https://www.youtube.com/watch?v=' + id,
      downloadUrl: null,
      autoThumbnailUrl: 'https://img.youtube.com/vi/' + id + '/maxresdefault.jpg'
    };
  }

  return null;
}

export async function handleGetGuideVideo(request, env) {
  const setting = await getSiteSetting(env, 'guide_video');
  return jsonResponse(
    {
      watchUrl: setting ? setting.watchUrl : null,
      thumbnailUrl: setting ? (setting.customThumbnailUrl || setting.autoThumbnailUrl) : null,
      downloadUrl: setting ? setting.downloadUrl : null
    },
    200
  );
}

export async function handleAdminSetGuideVideo(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) return adminGuardResponse(admin.reason);

  const body = await safeJson(request);
  const rawUrl = body && typeof body.url === 'string' ? body.url : '';
  const customThumbnailUrl = body && typeof body.thumbnailUrl === 'string' && body.thumbnailUrl.trim() ? body.thumbnailUrl.trim() : null;

  if (!rawUrl) {
    await setSiteSetting(env, 'guide_video', null);
    return jsonResponse({ ok: true, cleared: true }, 200);
  }

  const parsed = parseVideoUrl(rawUrl);
  if (!parsed) {
    return errorResponse('VALIDATION_ERROR', 'Could not recognize that as a Google Drive or YouTube link.', 400);
  }

  const record = Object.assign({}, parsed, { customThumbnailUrl });
  await setSiteSetting(env, 'guide_video', record);
  return jsonResponse(Object.assign({ ok: true }, record), 200);
}

const METHOD_LABELS_KEY = 'method_labels';
const KNOWN_METHODS = ['fps120', 'hybrid60', 'smart', 'tikquick720', 'nxtshark', 'extension'];
const MAX_LABEL_LEN = 120;

export async function handleGetMethodLabels(request, env) {
  const labels = (await getSiteSetting(env, METHOD_LABELS_KEY)) || {};
  return jsonResponse(labels, 200);
}

export async function handleAdminSetMethodLabels(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) return adminGuardResponse(admin.reason);

  const body = await safeJson(request);
  const labels = {};

  for (const method of KNOWN_METHODS) {
    const entry = body && body[method];
    if (!entry || typeof entry !== 'object') continue;
    const clean = {};
    for (const field of ['name', 'label', 'desc']) {
      const raw = typeof entry[field] === 'string' ? entry[field].trim() : '';
      if (raw) clean[field] = raw.slice(0, MAX_LABEL_LEN);
    }
    if (Object.keys(clean).length) labels[method] = clean;
  }

  await setSiteSetting(env, METHOD_LABELS_KEY, labels);
  return jsonResponse({ ok: true, labels }, 200);
}

const METHOD_GATES_KEY = 'method_gates';
const DEFAULT_METHOD_GATES = {
  nxtshark: { enabled: false },
  extension: { enabled: false, storeUrl: '' }
};

export async function handleGetMethodGates(request, env) {
  const gates = (await getSiteSetting(env, METHOD_GATES_KEY)) || DEFAULT_METHOD_GATES;
  return jsonResponse(gates, 200);
}

export async function handleAdminSetMethodGates(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) return adminGuardResponse(admin.reason);

  const body = await safeJson(request);
  const gates = {
    nxtshark: { enabled: !!(body && body.nxtshark && body.nxtshark.enabled) },
    extension: {
      enabled: !!(body && body.extension && body.extension.enabled),
      storeUrl: body && body.extension && typeof body.extension.storeUrl === 'string' ? body.extension.storeUrl.trim() : ''
    }
  };

  await setSiteSetting(env, METHOD_GATES_KEY, gates);
  return jsonResponse({ ok: true, gates }, 200);
}
