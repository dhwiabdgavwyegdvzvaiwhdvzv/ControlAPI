const DEVICE_ID_KEY = 'admin_device_id';

function generateUuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) { id = generateUuid(); localStorage.setItem(DEVICE_ID_KEY, id); }
  return id;
}

const deviceId = getOrCreateDeviceId();
let sessionToken = localStorage.getItem('admin_session_token') || null;
let turnstileToken = null;

async function apiFetch(path, options) {
  options = options || {};
  const headers = Object.assign(
    { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
    options.headers || {}
  );
  if (sessionToken) headers['Authorization'] = 'Bearer ' + sessionToken;
  const res = await fetch(path, Object.assign({}, options, { headers }));
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}

function $(id) { return document.getElementById(id); }

window.onTurnstileSuccess = function (token) {
  turnstileToken = token;
  $('loginBtn').disabled = false;
};
window.onTurnstileExpired = function () {
  turnstileToken = null;
  $('loginBtn').disabled = true;
};

function showLogin() {
  $('loginView').style.display = '';
  $('dashView').style.display = 'none';
}

function showDashboard(username) {
  $('loginView').style.display = 'none';
  $('dashView').style.display = '';
  $('whoUser').textContent = username;
  loadUsers();
}

$('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const errEl = $('loginError');
  errEl.textContent = '';
  if (!turnstileToken) { errEl.textContent = 'Please complete the verification challenge.'; return; }

  const username = $('loginUser').value.trim();
  const password = $('loginPass').value;
  $('loginBtn').disabled = true;

  let result;
  try {
    result = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, deviceId, turnstileToken })
    });
  } catch (networkErr) {
    errEl.textContent = 'Could not reach the server. Check your connection and try again.';
    if (window.turnstile) turnstile.reset('#loginTurnstile');
    turnstileToken = null;
    return;
  }
  if (window.turnstile) turnstile.reset('#loginTurnstile');
  turnstileToken = null;

  if (result.ok && result.data && result.data.token) {
    if (result.data.role !== 'admin') {
      errEl.textContent = 'This account does not have admin access.';
      $('loginBtn').disabled = false;
      return;
    }
    sessionToken = result.data.token;
    localStorage.setItem('admin_session_token', sessionToken);
    showDashboard(result.data.username);
    return;
  }

  const code = result.data && result.data.error && result.data.error.code;
  if (code === 'DEVICE_MISMATCH') {
    errEl.textContent = 'This account is locked to a different device/browser.';
  } else if (code === 'ACCOUNT_DISABLED') {
    errEl.textContent = 'This account has been disabled.';
  } else if (code === 'TURNSTILE_FAILED') {
    errEl.textContent = (result.data.error.message) || 'Verification failed. Please try again.';
  } else {
    errEl.textContent = 'Invalid username or password.';
  }
  $('loginBtn').disabled = false;
});

$('logoutBtn').addEventListener('click', async function () {
  try { await apiFetch('/auth/logout', { method: 'POST' }); } catch (e) {}
  sessionToken = null;
  localStorage.removeItem('admin_session_token');
  showLogin();
});

(async function restoreSession() {
  if (!sessionToken) { showLogin(); return; }
  let result;
  try {
    result = await apiFetch('/auth/session', { method: 'GET' });
  } catch (e) { showLogin(); return; }
  if (result.ok && result.data && result.data.role === 'admin') {
    showDashboard(result.data.username);
  } else {
    sessionToken = null;
    localStorage.removeItem('admin_session_token');
    showLogin();
  }
}());

// Tab click routing lives in keyreset.js now (krSetActiveTab + a single
// unified click handler covering both these legacy tabs and the new
// Key Reset tabs) — kept in one place to avoid two listeners fighting
// over the same .tab buttons.

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); } catch (e) { return '—'; }
}

async function loadUsers() {
  const tbody = $('usersTbody');
  tbody.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
  const result = await apiFetch('/admin/users', { method: 'GET' });
  if (!result.ok || !result.data) {
    tbody.innerHTML = '<tr><td colspan="6">Failed to load users.</td></tr>';
    return;
  }
  const users = result.data.users || [];
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="6">No users yet.</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(function (u) {
    const nextStatus = u.status === 'active' ? 'disabled' : 'active';
    const toggleClass = u.status === 'active' ? 'btn-danger' : 'btn-ok';
    const toggleLabel = u.status === 'active' ? 'Disable' : 'Enable';
    return '<tr>' +
      '<td>' + escapeHtml(u.username) + '</td>' +
      '<td>' + escapeHtml(u.tier) + '</td>' +
      '<td><span class="badge ' + escapeHtml(u.role) + '">' + escapeHtml(u.role) + '</span></td>' +
      '<td><span class="badge ' + escapeHtml(u.status) + '">' + escapeHtml(u.status) + '</span></td>' +
      '<td>' + fmtDate(u.createdAt) + '</td>' +
      '<td class="row-actions">' +
        '<button class="small-btn ' + toggleClass + '" onclick="setUserStatus(\'' + escapeHtml(u.username) + '\',\'' + nextStatus + '\')">' + toggleLabel + '</button>' +
        '<button class="small-btn" onclick="openResetModal(\'' + escapeHtml(u.username) + '\')">Reset Pass</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

$('refreshUsersBtn').addEventListener('click', loadUsers);

$('createUserForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msgEl = $('createUserMsg');
  msgEl.textContent = '';
  msgEl.className = 'msg';

  const username = $('cuUsername').value.trim();
  const password = $('cuPassword').value;
  const tier = $('cuTier').value;
  const role = $('cuRole').value;

  const result = await apiFetch('/admin/users/create', {
    method: 'POST',
    body: JSON.stringify({ username, password, tier, role })
  });

  if (result.ok && result.data && result.data.ok) {
    msgEl.textContent = 'User created.';
    msgEl.className = 'msg ok';
    $('createUserForm').reset();
    $('cuTier').value = 'premium';
    $('cuRole').value = 'user';
    loadUsers();
  } else {
    const message = (result.data && result.data.error && result.data.error.message) || 'Failed to create user.';
    msgEl.textContent = message;
    msgEl.className = 'msg err';
  }
});

window.setUserStatus = async function (username, status) {
  const result = await apiFetch('/admin/users/status', {
    method: 'POST',
    body: JSON.stringify({ username, status })
  });
  if (result.ok) loadUsers();
  else alert((result.data && result.data.error && result.data.error.message) || 'Failed to update user.');
};

let resetTargetUsername = null;

window.openResetModal = function (username) {
  resetTargetUsername = username;
  $('resetUserLabel').textContent = 'User: ' + username;
  $('resetPassword').value = '';
  $('resetMsg').textContent = '';
  $('resetModal').style.display = 'flex';
};

$('resetCancelBtn').addEventListener('click', function () {
  $('resetModal').style.display = 'none';
  resetTargetUsername = null;
});

$('resetConfirmBtn').addEventListener('click', async function () {
  const msgEl = $('resetMsg');
  const newPassword = $('resetPassword').value;
  if (newPassword.length < 8) {
    msgEl.textContent = 'Password must be at least 8 characters.';
    msgEl.className = 'msg err';
    return;
  }
  const result = await apiFetch('/admin/users/reset-password', {
    method: 'POST',
    body: JSON.stringify({ username: resetTargetUsername, newPassword })
  });
  if (result.ok && result.data && result.data.ok) {
    msgEl.textContent = 'Password updated.';
    msgEl.className = 'msg ok';
    setTimeout(function () { $('resetModal').style.display = 'none'; }, 700);
  } else {
    msgEl.textContent = (result.data && result.data.error && result.data.error.message) || 'Failed to reset password.';
    msgEl.className = 'msg err';
  }
});

async function loadReviews() {
  const list = $('reviewsList');
  list.innerHTML = 'Loading…';
  const result = await apiFetch('/admin/reviews/pending', { method: 'GET' });
  if (!result.ok || !result.data) { list.innerHTML = 'Failed to load reviews.'; return; }
  const reviews = result.data.reviews || [];
  if (!reviews.length) { list.innerHTML = '<div class="msg">No pending reviews.</div>'; return; }
  list.innerHTML = reviews.map(function (r) {
    return '<div class="review-card">' +
      '<div class="review-meta"><span class="review-author">' + escapeHtml(r.name) + '</span>' +
      '<span class="review-stars">' + '★'.repeat(r.rating || 0) + '☆'.repeat(5 - (r.rating || 0)) + '</span></div>' +
      '<div class="review-text">"' + escapeHtml(r.text) + '"</div>' +
      '<div class="row-actions">' +
        '<button class="small-btn btn-ok" onclick="approveReview(\'' + escapeHtml(r.id) + '\')">Approve</button>' +
        '<button class="small-btn btn-danger" onclick="deleteReview(\'' + escapeHtml(r.id) + '\')">Delete</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

$('refreshReviewsBtn').addEventListener('click', loadReviews);

window.approveReview = async function (id) {
  const result = await apiFetch('/admin/reviews/approve', { method: 'POST', body: JSON.stringify({ id }) });
  if (result.ok) loadReviews();
  else alert((result.data && result.data.error && result.data.error.message) || 'Failed to approve review.');
};

window.deleteReview = async function (id) {
  const result = await apiFetch('/admin/reviews/delete', { method: 'POST', body: JSON.stringify({ id }) });
  if (result.ok) loadReviews();
  else alert((result.data && result.data.error && result.data.error.message) || 'Failed to delete review.');
};

async function loadGuideVideo() {
  const curEl = $('guideVideoCurrent');
  curEl.textContent = 'Loading…';
  const result = await apiFetch('/settings/guide-video', { method: 'GET' });
  if (result.ok && result.data && result.data.embedUrl) {
    curEl.textContent = 'Current: ' + result.data.embedUrl;
    curEl.className = 'msg';
  } else {
    curEl.textContent = 'No video set yet.';
    curEl.className = 'msg';
  }
}

$('guideVideoForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msgEl = $('guideVideoMsg');
  msgEl.textContent = '';
  msgEl.className = 'msg';

  const url = $('guideVideoUrl').value.trim();
  const result = await apiFetch('/admin/settings/guide-video', {
    method: 'POST',
    body: JSON.stringify({ url })
  });

  if (result.ok && result.data && result.data.ok) {
    msgEl.textContent = 'Saved.';
    msgEl.className = 'msg ok';
    $('guideVideoUrl').value = '';
    loadGuideVideo();
  } else {
    const message = (result.data && result.data.error && result.data.error.message) || 'Failed to save.';
    msgEl.textContent = message;
    msgEl.className = 'msg err';
  }
});
