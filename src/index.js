

import {
  handleLogin,
  handleLogout,
  handleGetSession,
  handlePasswordStatus,
  handleChangePassword,
  handlePasswordResetWithKey,
  handleHealth
} from './handlers.js';
import {
  handleMethodAuthorize,
  handleMethodComplete,
  handleTidVerify,
  handleTelegramAuth,
  handleTrialStatus,
  handlePremiumUsage
} from './access.js';
import {
  handleSubmitReview,
  handleApprovedReviews,
  handleAdminPendingReviews,
  handleApproveReview,
  handleDeleteReview
} from './reviews.js';
import { handleStats, handleRenderStatsReport, handleAdminGetStatsOverride, handleAdminSetStatsOverride } from './stats.js';
import {
  handleAdminListUsers,
  handleAdminCreateUser,
  handleAdminSetUserStatus,
  handleAdminSetUserExpiry,
  handleAdminResetPassword
} from './adminUsers.js';
import { handleGetGuideVideo, handleAdminSetGuideVideo } from './settings.js';
import { handleOptions, withCors } from './cors.js';
import { errorResponse } from './errors.js';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    const url = new URL(request.url);
    let response;

    try {
      if (request.method === 'POST' && url.pathname === '/auth/login') {
        response = await handleLogin(request, env);
      } else if (request.method === 'POST' && url.pathname === '/auth/logout') {
        response = await handleLogout(request, env);
      } else if (request.method === 'GET' && url.pathname === '/auth/session') {
        response = await handleGetSession(request, env);
      } else if (request.method === 'GET' && url.pathname === '/auth/password/status') {
        response = await handlePasswordStatus(request, env);
      } else if (request.method === 'POST' && url.pathname === '/auth/password/change') {
        response = await handleChangePassword(request, env);
      } else if (request.method === 'POST' && url.pathname === '/auth/password/reset-with-key') {
        response = await handlePasswordResetWithKey(request, env);
      } else if (request.method === 'POST' && url.pathname === '/auth/method/authorize') {
        response = await handleMethodAuthorize(request, env);
      } else if (request.method === 'POST' && url.pathname === '/auth/method/complete') {
        response = await handleMethodComplete(request, env);
      } else if (request.method === 'POST' && url.pathname === '/auth/tid/verify') {
        response = await handleTidVerify(request, env);
      } else if (request.method === 'POST' && url.pathname === '/auth/telegram/verify') {
        response = await handleTelegramAuth(request, env);
      } else if (request.method === 'GET' && url.pathname === '/auth/trial/status') {
        response = await handleTrialStatus(request, env);
      } else if (request.method === 'GET' && url.pathname === '/auth/premium/usage') {
        response = await handlePremiumUsage(request, env);
      } else if (request.method === 'POST' && url.pathname === '/reviews/submit') {
        response = await handleSubmitReview(request, env);
      } else if (request.method === 'GET' && url.pathname === '/reviews/approved') {
        response = await handleApprovedReviews(request, env);
      } else if (request.method === 'GET' && url.pathname === '/admin/reviews/pending') {
        response = await handleAdminPendingReviews(request, env);
      } else if (request.method === 'POST' && url.pathname === '/admin/reviews/approve') {
        response = await handleApproveReview(request, env);
      } else if (request.method === 'POST' && url.pathname === '/admin/reviews/delete') {
        response = await handleDeleteReview(request, env);
      } else if (request.method === 'GET' && url.pathname === '/stats') {
        response = await handleStats(request, env);
      } else if (request.method === 'POST' && url.pathname === '/stats/render') {
        response = await handleRenderStatsReport(request, env);
      } else if (request.method === 'GET' && url.pathname === '/admin/stats/override') {
        response = await handleAdminGetStatsOverride(request, env);
      } else if (request.method === 'POST' && url.pathname === '/admin/stats/override') {
        response = await handleAdminSetStatsOverride(request, env);
      } else if (request.method === 'GET' && url.pathname === '/admin/users') {
        response = await handleAdminListUsers(request, env);
      } else if (request.method === 'POST' && url.pathname === '/admin/users/create') {
        response = await handleAdminCreateUser(request, env);
      } else if (request.method === 'POST' && url.pathname === '/admin/users/status') {
        response = await handleAdminSetUserStatus(request, env);
      } else if (request.method === 'POST' && url.pathname === '/admin/users/expiry') {
        response = await handleAdminSetUserExpiry(request, env);
      } else if (request.method === 'POST' && url.pathname === '/admin/users/reset-password') {
        response = await handleAdminResetPassword(request, env);
      } else if (request.method === 'GET' && url.pathname === '/settings/guide-video') {
        response = await handleGetGuideVideo(request, env);
      } else if (request.method === 'POST' && url.pathname === '/admin/settings/guide-video') {
        response = await handleAdminSetGuideVideo(request, env);
      } else if (request.method === 'GET' && url.pathname === '/health') {
        response = handleHealth();
      } else {
        response = errorResponse('NOT_FOUND', 'No such endpoint.', 404);
      }
    } catch (err) {
      
      console.error('Unhandled error:', err && err.stack ? err.stack : err);
      response = errorResponse('INTERNAL_ERROR', 'Something went wrong. Please try again.', 500);
    }

    return withCors(response, request, env);
  }
};
