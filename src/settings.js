

import { resolveAdminSession } from './session.js';
import { getSiteSetting, setSiteSetting } from './kv.js';
import { errorResponse, jsonResponse } from './errors.js';
import { safeJson } from './util.js';

function parseVideoUrl(rawUrl) {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!url) return null;

  const driveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    const id = driveMatch[1];
    return {
      provider: 'drive',
      embedUrl: 'https://drive.google.com/file/d/' + id + '/preview',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + id
    };
  }

  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/);
  if (ytMatch) {
    const id = ytMatch[1];
    return {
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/' + id,
      downloadUrl: null
    };
  }

  return null;
}

export async function handleGetGuideVideo(request, env) {
  const setting = await getSiteSetting(env, 'guide_video');
  return jsonResponse(
    {
      embedUrl: setting ? setting.embedUrl : null,
      downloadUrl: setting ? setting.downloadUrl : null
    },
    200
  );
}

export async function handleAdminSetGuideVideo(request, env) {
  const admin = await resolveAdminSession(request, env);
  if (!admin.ok) {
    if (admin.reason === 'not_admin') return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    return errorResponse('INVALID_SESSION', 'Your session is invalid or has expired. Please log in again.', 401);
  }

  const body = await safeJson(request);
  const rawUrl = body && typeof body.url === 'string' ? body.url : '';

  if (!rawUrl) {
    await setSiteSetting(env, 'guide_video', null);
    return jsonResponse({ ok: true, cleared: true }, 200);
  }

  const parsed = parseVideoUrl(rawUrl);
  if (!parsed) {
    return errorResponse('VALIDATION_ERROR', 'Could not recognize that as a Google Drive or YouTube link.', 400);
  }

  await setSiteSetting(env, 'guide_video', parsed);
  return jsonResponse(Object.assign({ ok: true }, parsed), 200);
}
