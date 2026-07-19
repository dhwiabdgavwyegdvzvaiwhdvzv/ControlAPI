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

let resetTurnstileToken = null;
window.onResetTurnstileSuccess = function (token) {
  resetTurnstileToken = token;
  $('resetKeySubmitBtn').disabled = false;
};
window.onResetTurnstileExpired = function () {
  resetTurnstileToken = null;
  $('resetKeySubmitBtn').disabled = true;
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
  } else if (code === 'ACCOUNT_EXPIRED') {
    errEl.textContent = 'This account has expired.';
  } else if (code === 'TURNSTILE_FAILED') {
    errEl.textContent = (result.data.error.message) || 'Verification failed. Please try again.';
  } else {
    errEl.textContent = 'Invalid username or password.';
  }
  $('loginBtn').disabled = false;
});

$('forgotPassBtn').addEventListener('click', function () {
  $('loginView').querySelector('.login-card').style.display = 'none';
  $('resetKeyCard').style.display = '';
  $('resetKeyMsg').textContent = '';
});

$('resetKeyBackBtn').addEventListener('click', function () {
  $('resetKeyCard').style.display = 'none';
  $('loginView').querySelector('.login-card').style.display = '';
});

$('resetKeySubmitBtn').addEventListener('click', async function () {
  const msgEl = $('resetKeyMsg');
  msgEl.textContent = '';
  msgEl.style.color = '';

  const username = $('rkUsername').value.trim();
  const resetKey = $('rkResetKey').value.trim();
  const newPassword = $('rkNewPassword').value;

  if (!resetTurnstileToken) {
    msgEl.textContent = 'Please complete the verification challenge.';
    return;
  }
  if (!username || !resetKey || newPassword.length < 8) {
    msgEl.textContent = 'Fill in username, reset key, and a new password (8+ chars).';
    return;
  }

  $('resetKeySubmitBtn').disabled = true;
  let result;
  try {
    result = await apiFetch('/auth/password/reset-with-key', {
      method: 'POST',
      body: JSON.stringify({ username, resetKey, newPassword, turnstileToken: resetTurnstileToken })
    });
  } catch (e) {
    msgEl.textContent = 'Could not reach the server. Check your connection and try again.';
    if (window.turnstile) turnstile.reset('#resetTurnstile');
    resetTurnstileToken = null;
    return;
  }
  if (window.turnstile) turnstile.reset('#resetTurnstile');
  resetTurnstileToken = null;
  $('resetKeySubmitBtn').disabled = true;

  if (result.ok && result.data && result.data.ok) {
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = 'Password updated. You can log in now.';
    $('rkResetKey').value = '';
    $('rkNewPassword').value = '';
    setTimeout(function () {
      $('resetKeyCard').style.display = 'none';
      $('loginView').querySelector('.login-card').style.display = '';
      $('loginUser').value = username;
    }, 900);
  } else {
    const code = result.data && result.data.error && result.data.error.code;
    if (code === 'TOO_MANY_ATTEMPTS') {
      msgEl.textContent = 'Too many attempts. Try again later.';
    } else if (code === 'INVALID_RESET_KEY') {
      msgEl.textContent = 'Incorrect reset key.';
    } else if (code === 'NOT_FOUND') {
      msgEl.textContent = 'No account with that username.';
    } else {
      msgEl.textContent = (result.data && result.data.error && result.data.error.message) || 'Failed to reset password.';
    }
  }
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

function fmtExpiry(dateStr) {
  if (!dateStr) return '<span style="color:var(--text-dim);">Lifetime</span>';
  const expired = new Date(dateStr + 'T23:59:59Z').getTime() < Date.now();
  const label = fmtDate(dateStr);
  return expired ? '<span style="color:var(--red);">' + label + ' (expired)</span>' : label;
}

function fmtCredit(u) {
  if (!u.credit) return '<span style="color:var(--text-dim);">—</span>';
  return u.credit.remaining + '/' + u.credit.limit;
}

let usersCache = [];

async function loadUsers() {
  const tbody = $('usersTbody');
  tbody.innerHTML = '<tr><td colspan="8">Loading…</td></tr>';
  const result = await apiFetch('/admin/users', { method: 'GET' });
  if (!result.ok || !result.data) {
    tbody.innerHTML = '<tr><td colspan="8">Failed to load users.</td></tr>';
    return;
  }
  const users = result.data.users || [];
  usersCache = users;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="8">No users yet.</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(function (u) {
    const nextStatus = u.status === 'active' ? 'disabled' : 'active';
    const toggleClass = u.status === 'active' ? 'btn-danger' : 'btn-ok';
    const toggleLabel = u.status === 'active' ? 'Disable' : 'Enable';
    const expiryArg = u.expiresAt ? "'" + escapeHtml(u.expiresAt) + "'" : 'null';
    return '<tr>' +
      '<td>' + escapeHtml(u.username) + '</td>' +
      '<td>' + escapeHtml(u.tier) + '</td>' +
      '<td><span class="badge ' + escapeHtml(u.role) + '">' + escapeHtml(u.role) + '</span></td>' +
      '<td><span class="badge ' + escapeHtml(u.status) + '">' + escapeHtml(u.status) + '</span></td>' +
      '<td>' + fmtExpiry(u.expiresAt) + '</td>' +
      '<td>' + fmtCredit(u) + '</td>' +
      '<td>' + fmtDate(u.createdAt) + '</td>' +
      '<td class="row-actions">' +
        '<button class="small-btn ' + toggleClass + '" onclick="setUserStatus(\'' + escapeHtml(u.username) + '\',\'' + nextStatus + '\')">' + toggleLabel + '</button>' +
        '<button class="small-btn" onclick="openResetModal(\'' + escapeHtml(u.username) + '\')">Reset Pass</button>' +
        '<button class="small-btn" onclick="openExpiryModal(\'' + escapeHtml(u.username) + '\',' + expiryArg + ')">Expiry</button>' +
        '<button class="small-btn" onclick="openManageModal(\'' + escapeHtml(u.username) + '\')">Manage</button>' +
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
  const expiresAt = $('cuExpiry').value || null;

  const result = await apiFetch('/admin/users/create', {
    method: 'POST',
    body: JSON.stringify({ username, password, tier, role, expiresAt })
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

let expiryTargetUsername = null;

window.openExpiryModal = function (username, currentExpiry) {
  expiryTargetUsername = username;
  $('expiryUserLabel').textContent = 'User: ' + username;
  $('expiryDateInput').value = currentExpiry || '';
  $('expiryNoExpiryCheck').checked = !currentExpiry;
  $('expiryDateInput').disabled = !currentExpiry;
  $('expiryMsg').textContent = '';
  $('expiryModal').style.display = 'flex';
};

$('expiryNoExpiryCheck').addEventListener('change', function () {
  $('expiryDateInput').disabled = this.checked;
});

$('expiryCancelBtn').addEventListener('click', function () {
  $('expiryModal').style.display = 'none';
  expiryTargetUsername = null;
});

$('expirySaveBtn').addEventListener('click', async function () {
  const msgEl = $('expiryMsg');
  const noExpiry = $('expiryNoExpiryCheck').checked;
  const dateVal = $('expiryDateInput').value;
  if (!noExpiry && !dateVal) {
    msgEl.textContent = 'Pick a date, or check "No expiry".';
    msgEl.className = 'msg err';
    return;
  }
  const result = await apiFetch('/admin/users/expiry', {
    method: 'POST',
    body: JSON.stringify({ username: expiryTargetUsername, expiresAt: noExpiry ? null : dateVal })
  });
  if (result.ok && result.data && result.data.ok) {
    msgEl.textContent = 'Saved.';
    msgEl.className = 'msg ok';
    setTimeout(function () { $('expiryModal').style.display = 'none'; loadUsers(); }, 500);
  } else {
    msgEl.textContent = (result.data && result.data.error && result.data.error.message) || 'Failed to save.';
    msgEl.className = 'msg err';
  }
});

let manageTargetUsername = null;

window.openManageModal = function (username) {
  manageTargetUsername = username;
  const u = usersCache.find(function (x) { return x.username === username; });
  $('manageUserLabel').textContent = 'User: ' + username;
  $('manageRoleSelect').value = (u && u.role) || 'user';
  $('manageCreditInfo').textContent = (u && u.credit)
    ? 'Telegram ID: ' + (u.credit.tid || 'not verified') + ' — ' + u.credit.remaining + '/' + u.credit.limit + ' videos remaining this month'
    : 'Free tier — no premium credit tracked.';
  $('manageMsg').textContent = '';
  $('manageModal').style.display = 'flex';
};

$('manageCloseBtn').addEventListener('click', function () {
  $('manageModal').style.display = 'none';
  manageTargetUsername = null;
});

$('manageRoleSaveBtn').addEventListener('click', async function () {
  const msgEl = $('manageMsg');
  const result = await apiFetch('/admin/users/role', {
    method: 'POST',
    body: JSON.stringify({ username: manageTargetUsername, role: $('manageRoleSelect').value })
  });
  if (result.ok && result.data && result.data.ok) {
    msgEl.textContent = 'Role updated.';
    msgEl.className = 'msg ok';
    loadUsers();
  } else {
    msgEl.textContent = (result.data && result.data.error && result.data.error.message) || 'Failed to update role.';
    msgEl.className = 'msg err';
  }
});

$('manageResetDeviceBtn').addEventListener('click', async function () {
  const msgEl = $('manageMsg');
  const result = await apiFetch('/admin/users/reset-device', {
    method: 'POST',
    body: JSON.stringify({ username: manageTargetUsername })
  });
  if (result.ok && result.data && result.data.ok) {
    msgEl.textContent = 'Device ID reset. They can log in from a new device now.';
    msgEl.className = 'msg ok';
  } else {
    msgEl.textContent = (result.data && result.data.error && result.data.error.message) || 'Failed to reset device.';
    msgEl.className = 'msg err';
  }
});

$('manageResetTidBtn').addEventListener('click', async function () {
  const msgEl = $('manageMsg');
  const result = await apiFetch('/admin/users/reset-tid', {
    method: 'POST',
    body: JSON.stringify({ username: manageTargetUsername })
  });
  if (result.ok && result.data && result.data.ok) {
    msgEl.textContent = 'Telegram ID reset. They must verify again to use premium methods.';
    msgEl.className = 'msg ok';
    loadUsers();
  } else {
    msgEl.textContent = (result.data && result.data.error && result.data.error.message) || 'Failed to reset Telegram ID.';
    msgEl.className = 'msg err';
  }
});

$('manageDeleteBtn').addEventListener('click', async function () {
  if (!confirm('Delete user "' + manageTargetUsername + '"? This cannot be undone.')) return;
  const msgEl = $('manageMsg');
  const result = await apiFetch('/admin/users/delete', {
    method: 'POST',
    body: JSON.stringify({ username: manageTargetUsername })
  });
  if (result.ok && result.data && result.data.ok) {
    $('manageModal').style.display = 'none';
    loadUsers();
  } else {
    msgEl.textContent = (result.data && result.data.error && result.data.error.message) || 'Failed to delete user.';
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
  if (result.ok && result.data && result.data.watchUrl) {
    curEl.textContent = 'Current: ' + result.data.watchUrl + (result.data.thumbnailUrl ? ' (thumbnail set)' : ' (auto thumbnail)');
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
  const thumbnailUrl = $('guideVideoThumbUrl').value.trim();
  const result = await apiFetch('/admin/settings/guide-video', {
    method: 'POST',
    body: JSON.stringify({ url, thumbnailUrl })
  });

  if (result.ok && result.data && result.data.ok) {
    msgEl.textContent = 'Saved.';
    msgEl.className = 'msg ok';
    $('guideVideoUrl').value = '';
    $('guideVideoThumbUrl').value = '';
    loadGuideVideo();
  } else {
    const message = (result.data && result.data.error && result.data.error.message) || 'Failed to save.';
    msgEl.textContent = message;
    msgEl.className = 'msg err';
  }
});

async function loadMethodGates() {
  const c = $('methodGatesFields');
  c.innerHTML = 'Loading…';
  const result = await apiFetch('/settings/method-gates', { method: 'GET' });
  if (!result.ok || !result.data) {
    c.innerHTML = '<div class="msg err">Failed to load.</div>';
    return;
  }
  const g = result.data;
  c.innerHTML =
    '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px;">' +
      '<input type="checkbox" id="mg_nxtshark_enabled" style="width:auto;margin:0;" ' + (g.nxtshark && g.nxtshark.enabled ? 'checked' : '') + '> ' +
      'NXTShark X BiguuDev Method — unlocked' +
    '</label>' +
    '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:8px;">' +
      '<input type="checkbox" id="mg_extension_enabled" style="width:auto;margin:0;" ' + (g.extension && g.extension.enabled ? 'checked' : '') + '> ' +
      'Extension Method — unlocked (redirects to store link below when clicked)' +
    '</label>' +
    '<input type="text" id="mg_extension_store_url" placeholder="Chrome Web Store URL" value="' + escapeHtml((g.extension && g.extension.storeUrl) || '') + '">';
}

$('refreshMethodGatesBtn').addEventListener('click', loadMethodGates);

$('saveMethodGatesBtn').addEventListener('click', async function () {
  const msgEl = $('methodGatesMsg');
  msgEl.textContent = '';
  msgEl.className = 'msg';

  const body = {
    nxtshark: { enabled: $('mg_nxtshark_enabled').checked },
    extension: { enabled: $('mg_extension_enabled').checked, storeUrl: $('mg_extension_store_url').value.trim() }
  };

  const result = await apiFetch('/admin/settings/method-gates', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (result.ok && result.data && result.data.ok) {
    msgEl.textContent = 'Saved.';
    msgEl.className = 'msg ok';
    loadMethodGates();
  } else {
    const message = (result.data && result.data.error && result.data.error.message) || 'Failed to save.';
    msgEl.textContent = message;
    msgEl.className = 'msg err';
  }
});

const STATS_OVERRIDE_FIELDS = [
  { key: 'totalUsers', label: 'Users' },
  { key: 'premiumUsers', label: 'Premium Users' },
  { key: 'renderSuccessPct', label: 'Render Success %' },
  { key: 'rating', label: 'Rating (0-5)' }
];

async function loadStatsOverride() {
  const c = $('statsOverrideFields');
  c.innerHTML = 'Loading…';
  const result = await apiFetch('/admin/stats/override', { method: 'GET' });
  if (!result.ok || !result.data) {
    c.innerHTML = '<div class="msg err">Failed to load.</div>';
    return;
  }
  const auto = result.data.auto || {};
  const override = result.data.override || {};
  c.innerHTML = STATS_OVERRIDE_FIELDS.map(function (f) {
    const step = f.key === 'rating' ? '0.1' : '1';
    const current = override[f.key] != null ? override[f.key] : '';
    return '<div style="margin-bottom:10px;">' +
      '<label class="field-hint">' + f.label + ' — auto: ' + (auto[f.key] != null ? auto[f.key] : '—') + '</label>' +
      '<input type="number" step="' + step + '" id="stov_' + f.key + '" placeholder="Auto (blank = ' + (auto[f.key] != null ? auto[f.key] : 'auto') + ')" value="' + current + '">' +
    '</div>';
  }).join('');
}

$('refreshStatsOverrideBtn').addEventListener('click', loadStatsOverride);

$('saveStatsOverrideBtn').addEventListener('click', async function () {
  const msgEl = $('statsOverrideMsg');
  msgEl.textContent = '';
  msgEl.className = 'msg';

  const body = {};
  STATS_OVERRIDE_FIELDS.forEach(function (f) {
    const el = $('stov_' + f.key);
    body[f.key] = el && el.value.trim() !== '' ? el.value.trim() : null;
  });

  const result = await apiFetch('/admin/stats/override', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (result.ok && result.data && result.data.ok) {
    msgEl.textContent = 'Saved.';
    msgEl.className = 'msg ok';
    loadStatsOverride();
  } else {
    const message = (result.data && result.data.error && result.data.error.message) || 'Failed to save.';
    msgEl.textContent = message;
    msgEl.className = 'msg err';
  }
});
