
// =====================================
// Key Reset Panel — ported as native tabs
// Talks directly to the same backend Worker "my key project" uses
// (biguudev-admin-v2.biguudev.workers.dev). "my key project" itself is
// never modified — this is an independent client built against its API.
// =====================================

const KR_API = "https://biguudev-admin-v2.biguudev.workers.dev";
const KR_ADMIN_KEY = "8c1a2f9d7e4b5c6a9f1d3e8b7c2a4f6e9b1c5d8e";

const krState = { users: [], statistics: {}, settings: {} };

async function krApi(path, options) {
  options = options || {};
  const connector = path.includes("?") ? "&" : "?";
  const res = await fetch(KR_API + path + connector + "key=" + encodeURIComponent(KR_ADMIN_KEY), Object.assign(
    { headers: { "Content-Type": "application/json" } },
    options
  ));
  let data;
  try { data = await res.json(); } catch (e) { throw new Error(await res.text()); }
  if (!res.ok) throw new Error(data.message || "Server Error");
  return data;
}

function krUnixToDate(t) {
  if (!t) return "-";
  return new Date(t * 1000).toLocaleString();
}

function krEl(id) { return document.getElementById(id); }

function krShowLoader(container) { container.innerHTML = '<p class="msg">Loading…</p>'; }
function krShowError(container, text) { container.innerHTML = '<p class="msg err">' + escapeHtml(text) + '</p>'; }

function krEffectiveScripts(user) {
  return Array.isArray(user.scripts) ? user.scripts : ["VMC.js"];
}

async function krFetchScriptList() {
  try { const res = await krApi("/scripts"); return res.scripts || []; }
  catch (e) { return []; }
}

// ---------------- Generic modal (shared by all Key Reset tabs) ----------------
function krOpenModal(html, wide) {
  let m = krEl("krModal");
  if (!m) {
    m = document.createElement("div");
    m.id = "krModal";
    m.className = "modal-overlay";
    m.style.display = "none";
    m.innerHTML = '<div class="modal-card' + (wide ? ' wide' : '') + '" id="krModalCard"><div id="krModalContent"></div><div class="modal-actions"><button class="small-btn" onclick="krCloseModal()">Close</button></div></div>';
    document.body.appendChild(m);
  }
  krEl("krModalCard").className = "modal-card" + (wide ? " wide" : "");
  krEl("krModalContent").innerHTML = html;
  m.style.display = "flex";
}
function krCloseModal() {
  const m = krEl("krModal");
  if (m) m.style.display = "none";
}

// ---------------- Dashboard ----------------
async function loadKRDashboard() {
  krSetActiveTab("krDashboard");
  const c = krEl("krDashboardPanel");
  krShowLoader(c);
  try {
    const data = await krApi("/statistics");
    krState.statistics = data;
    c.innerHTML =
      '<div class="cards">' +
        '<div class="panel-card"><div class="card-title">Total Users</div><div class="card-value">' + data.totalUsers + '</div></div>' +
        '<div class="panel-card"><div class="card-title">Active</div><div class="card-value">' + data.activeUsers + '</div></div>' +
        '<div class="panel-card"><div class="card-title">Disabled</div><div class="card-value">' + data.disabledUsers + '</div></div>' +
        '<div class="panel-card"><div class="card-title">Expired</div><div class="card-value">' + data.expiredUsers + '</div></div>' +
      '</div>';
  } catch (err) { krShowError(c, err.message); }
}

// ---------------- Users ----------------
function krStatusBadge(status) {
  if (status === "active") return '<span class="badge active">Active</span>';
  if (status === "disabled") return '<span class="badge disabled">Disabled</span>';
  return '<span class="badge expired">Expired</span>';
}

function krUserRow(user) {
  return '<tr>' +
    '<td>' + escapeHtml(user.username) + '</td>' +
    '<td>' + krStatusBadge(user.status) + '</td>' +
    '<td>' + krUnixToDate(user.expire) + '</td>' +
    '<td>' + krUnixToDate(user.lastSeen) + '</td>' +
    '<td>' + escapeHtml(user.ip || "-") + '</td>' +
    '<td class="row-actions">' +
      '<button class="small-btn" onclick="krViewUser(\'' + escapeHtml(user.key) + '\')">View</button>' +
      '<button class="small-btn" onclick="krEditUser(\'' + escapeHtml(user.key) + '\')">Edit</button>' +
      '<button class="small-btn btn-ok" onclick="krEnableUser(\'' + escapeHtml(user.key) + '\')">Enable</button>' +
      '<button class="small-btn" onclick="krDisableUser(\'' + escapeHtml(user.key) + '\')">Disable</button>' +
      '<button class="small-btn btn-danger" onclick="krDeleteUser(\'' + escapeHtml(user.key) + '\')">Delete</button>' +
    '</td>' +
  '</tr>';
}

function krRenderUsers(users) {
  const c = krEl("krUsersPanel");
  c.innerHTML =
    '<div class="panel-card">' +
      '<div class="panel-title">Users <button class="small-btn" onclick="loadKRUsers()">Refresh</button></div>' +
      '<input id="krUserSearch" class="search-box" placeholder="Search user..." style="margin-bottom:10px;">' +
      '<table><thead><tr><th>Username</th><th>Status</th><th>Expire</th><th>Last Seen</th><th>IP</th><th></th></tr></thead>' +
      '<tbody id="krUsersTbody">' + users.map(krUserRow).join("") + '</tbody></table>' +
    '</div>';
  krEl("krUserSearch").oninput = function () {
    const kw = this.value.toLowerCase().trim();
    const filtered = krState.users.filter(function (u) {
      return u.username.toLowerCase().includes(kw) || (u.ip || "").toLowerCase().includes(kw);
    });
    krEl("krUsersTbody").innerHTML = filtered.map(krUserRow).join("");
  };
}

async function loadKRUsers() {
  krSetActiveTab("krUsers");
  const c = krEl("krUsersPanel");
  krShowLoader(c);
  try {
    const res = await krApi("/users");
    krState.users = res.users || [];
    krRenderUsers(krState.users);
  } catch (err) { krShowError(c, err.message); }
}

window.krViewUser = async function (id) {
  try {
    const res = await krApi("/user?id=" + encodeURIComponent(id));
    const p = res.profile, s = res.security;
    krOpenModal(
      '<h2 style="margin-bottom:12px;">' + escapeHtml(p.username) + '</h2>' +
      '<table style="width:100%;">' +
        '<tr><td>Status</td><td>' + escapeHtml(p.status) + '</td></tr>' +
        '<tr><td>Expire</td><td>' + krUnixToDate(p.expire) + '</td></tr>' +
        '<tr><td>Created</td><td>' + krUnixToDate(p.created) + '</td></tr>' +
        '<tr><td>Last Seen</td><td>' + krUnixToDate(p.lastSeen) + '</td></tr>' +
        '<tr><td>IP</td><td>' + escapeHtml(s.ip || "-") + '</td></tr>' +
        '<tr><td>Device</td><td>' + escapeHtml(s.device || "-") + '</td></tr>' +
        '<tr><td>Failed</td><td>' + s.failed + '</td></tr>' +
        '<tr><td>Locked</td><td>' + (s.lock ? "Yes" : "No") + '</td></tr>' +
        '<tr><td>Scripts</td><td>' + ((p.scripts && p.scripts.length) ? p.scripts.join(", ") : "VMC.js (default)") + '</td></tr>' +
      '</table>' +
      '<div class="row-actions" style="margin-top:12px;">' +
        '<button class="small-btn" onclick="krResetIP(\'' + escapeHtml(id) + '\')">Reset IP</button>' +
      '</div>'
    );
  } catch (err) { alert(err.message); }
};

window.krEnableUser = async function (id) {
  if (!confirm("Enable this user?")) return;
  try { const r = await krApi("/enable?id=" + encodeURIComponent(id), { method: "POST" }); alert(r.message); loadKRUsers(); }
  catch (err) { alert(err.message); }
};
window.krDisableUser = async function (id) {
  if (!confirm("Disable this user?")) return;
  try { const r = await krApi("/disable?id=" + encodeURIComponent(id), { method: "POST" }); alert(r.message); loadKRUsers(); }
  catch (err) { alert(err.message); }
};
window.krDeleteUser = async function (id) {
  if (!confirm("Delete this user? This cannot be undone.")) return;
  try { const r = await krApi("/delete?id=" + encodeURIComponent(id), { method: "POST" }); alert(r.message); loadKRUsers(); }
  catch (err) { alert(err.message); }
};
window.krResetIP = async function (id) {
  if (!confirm("Reset IP?")) return;
  try { const r = await krApi("/resetip?id=" + encodeURIComponent(id), { method: "POST" }); alert(r.message); }
  catch (err) { alert(err.message); }
};

window.krEditUser = async function (id) {
  let data, allScripts;
  try {
    [data, allScripts] = await Promise.all([krApi("/user?id=" + encodeURIComponent(id)), krFetchScriptList()]);
  } catch (err) { alert(err.message); return; }
  const user = data.profile;
  krOpenModal(
    '<h2 style="margin-bottom:12px;">Edit User</h2>' +
    '<div style="margin-bottom:10px;"><label class="field-hint">Username</label><input id="krEditUsername" value="' + escapeHtml(user.username) + '"></div>' +
    '<div style="margin-bottom:10px;"><label class="field-hint">Expire (Unix)</label><input id="krEditExpire" type="number" value="' + user.expire + '"></div>' +
    '<div style="margin-bottom:10px;"><label class="field-hint">Allowed Scripts</label>' + krRenderScriptCheckboxes(allScripts, user.scripts) + '</div>' +
    '<div class="modal-actions"><button class="small-btn btn-ok" onclick="krSaveEditUser(\'' + escapeHtml(id) + '\')">Save Changes</button></div>',
    true
  );
};

window.krSaveEditUser = async function (id) {
  const username = krEl("krEditUsername").value.trim();
  const expire = Number(krEl("krEditExpire").value);
  if (!username || !expire) { alert("Username and expire are required"); return; }
  const scripts = krCollectCheckedScripts(krEl("krModalContent"));
  try {
    const r = await krApi("/edituser", { method: "POST", body: JSON.stringify({ token: id, username, expire, scripts }) });
    alert(r.message);
    krCloseModal();
    loadKRUsers();
  } catch (err) { alert(err.message); }
};

function krRenderScriptCheckboxes(allScripts, selected) {
  const list = krEffectiveScripts({ scripts: selected });
  if (!allScripts.length) return '<p class="field-hint">No scripts uploaded yet.</p>';
  return '<div class="script-checklist">' + allScripts.map(function (name) {
    const checked = list.includes(name) ? "checked" : "";
    return '<label class="script-check"><input type="checkbox" value="' + escapeHtml(name) + '" ' + checked + '><span>' + escapeHtml(name) + '</span></label>';
  }).join("") + '</div>';
}
function krCollectCheckedScripts(containerEl) {
  return Array.from(containerEl.querySelectorAll(".script-checklist input[type=checkbox]:checked")).map(function (el) { return el.value; });
}

// ---------------- Add User ----------------
async function loadKRAddUser() {
  krSetActiveTab("krAdd");
  const c = krEl("krAddPanel");
  krShowLoader(c);
  const expire = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
  const allScripts = await krFetchScriptList();
  c.innerHTML =
    '<div class="panel-card">' +
      '<div class="panel-title">Create User</div>' +
      '<div style="margin-bottom:10px;"><label class="field-hint">Username</label><input id="krAddUsername" placeholder="Username"></div>' +
      '<div style="margin-bottom:10px;"><label class="field-hint">Token</label><input id="krAddToken" placeholder="Unique Token"><button class="small-btn" onclick="krEl(\'krAddToken\').value=krGenerateToken()" style="margin-top:6px;">Generate</button></div>' +
      '<div style="margin-bottom:10px;"><label class="field-hint">Expire (Unix)</label><input id="krAddExpire" type="number" value="' + expire + '"></div>' +
      '<div style="margin-bottom:14px;"><label class="field-hint">Allowed Scripts</label>' + krRenderScriptCheckboxes(allScripts, []) + '</div>' +
      '<button class="btn-ok small-btn" style="padding:10px 18px;font-size:13px;" onclick="krCreateUser()">Create User</button>' +
      '<div id="krAddResult" class="msg"></div>' +
    '</div>';
}

function krGenerateToken(length) {
  length = length || 32;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let t = "";
  for (let i = 0; i < length; i++) t += chars.charAt(Math.floor(Math.random() * chars.length));
  return t;
}

window.krCreateUser = async function () {
  const username = krEl("krAddUsername").value.trim();
  const token = krEl("krAddToken").value.trim();
  const expire = Number(krEl("krAddExpire").value);
  const msgEl = krEl("krAddResult");
  if (!username || !token || !expire) { msgEl.textContent = "Username, token and expire are required"; msgEl.className = "msg err"; return; }
  const scripts = krCollectCheckedScripts(krEl("krAddPanel"));
  try {
    const r = await krApi("/adduser", { method: "POST", body: JSON.stringify({ username, token, expire, scripts }) });
    msgEl.textContent = r.message;
    msgEl.className = "msg ok";
    setTimeout(loadKRAddUser, 700);
  } catch (err) { msgEl.textContent = err.message; msgEl.className = "msg err"; }
};

// ---------------- Statistics ----------------
async function loadKRStatistics() {
  krSetActiveTab("krStats");
  const c = krEl("krStatsPanel");
  krShowLoader(c);
  try {
    const s = await krApi("/statistics");
    krState.statistics = s;
    c.innerHTML =
      '<div class="cards">' +
        '<div class="panel-card"><div class="card-title">Total Users</div><div class="card-value">' + s.totalUsers + '</div></div>' +
        '<div class="panel-card"><div class="card-title">Active</div><div class="card-value">' + s.activeUsers + '</div></div>' +
        '<div class="panel-card"><div class="card-title">Disabled</div><div class="card-value">' + s.disabledUsers + '</div></div>' +
        '<div class="panel-card"><div class="card-title">Expired</div><div class="card-value">' + s.expiredUsers + '</div></div>' +
      '</div>' +
      '<div class="panel-card"><table>' +
        '<tr><th>Server Time</th><td>' + krUnixToDate(s.serverTime) + '</td></tr>' +
        '<tr><th>Total Accounts</th><td>' + s.totalUsers + '</td></tr>' +
        '<tr><th>Enabled</th><td>' + s.activeUsers + '</td></tr>' +
        '<tr><th>Disabled</th><td>' + s.disabledUsers + '</td></tr>' +
        '<tr><th>Expired</th><td>' + s.expiredUsers + '</td></tr>' +
      '</table></div>';
  } catch (err) { krShowError(c, err.message); }
}

// ---------------- Settings ----------------
async function loadKRSettings() {
  krSetActiveTab("krSettings");
  const c = krEl("krSettingsPanel");
  krShowLoader(c);
  try {
    const res = await krApi("/settings");
    krState.settings = res.settings;
    c.innerHTML =
      '<div class="panel-card">' +
        '<div class="panel-title">Panel Settings</div>' +
        '<div style="margin-bottom:10px;"><label class="field-hint">Panel Name</label><input id="krPanelName" value="' + escapeHtml(res.settings.panelName) + '"></div>' +
        '<div style="margin-bottom:10px;"><label class="field-hint">Default Expire Days</label><input id="krExpireDays" type="number" value="' + res.settings.defaultExpireDays + '"></div>' +
        '<div style="margin-bottom:10px;"><label class="field-hint">Maintenance</label><select id="krMaintenance"><option value="false">Disabled</option><option value="true" ' + (res.settings.maintenance ? "selected" : "") + '>Enabled</option></select></div>' +
        '<div style="margin-bottom:14px;"><label class="field-hint">Allow Registration</label><select id="krRegistration"><option value="true" ' + (res.settings.allowRegistration ? "selected" : "") + '>Yes</option><option value="false" ' + (!res.settings.allowRegistration ? "selected" : "") + '>No</option></select></div>' +
        '<button class="btn-ok small-btn" style="padding:10px 18px;font-size:13px;" onclick="krSaveSettings()">Save Settings</button>' +
        '<div id="krSettingsMsg" class="msg"></div>' +
      '</div>';
  } catch (err) { krShowError(c, err.message); }
}

window.krSaveSettings = async function () {
  const msgEl = krEl("krSettingsMsg");
  const body = {
    panelName: krEl("krPanelName").value,
    maintenance: krEl("krMaintenance").value === "true",
    allowRegistration: krEl("krRegistration").value === "true",
    defaultExpireDays: Number(krEl("krExpireDays").value),
    version: "2.0"
  };
  try {
    const r = await krApi("/settings", { method: "POST", body: JSON.stringify(body) });
    msgEl.textContent = r.message; msgEl.className = "msg ok";
  } catch (err) { msgEl.textContent = err.message; msgEl.className = "msg err"; }
};

// ---------------- Scripts ----------------
let krReplaceTargetKey = null;

async function loadKRScripts() {
  krSetActiveTab("krScripts");
  const c = krEl("krScriptsPanel");
  krShowLoader(c);
  try {
    const res = await krApi("/scripts");
    krRenderScripts(res.scripts || []);
  } catch (err) { krShowError(c, err.message); }
}

function krScriptRow(key) {
  return '<tr><td>' + escapeHtml(key) + '</td><td class="row-actions">' +
    '<button class="small-btn" onclick="krReplaceScript(\'' + escapeHtml(key) + '\')">Replace</button>' +
    '<button class="small-btn btn-danger" onclick="krDeleteScript(\'' + escapeHtml(key) + '\')">Delete</button>' +
    '<button class="small-btn btn-ok" onclick="krOpenAccessModal(\'' + escapeHtml(key) + '\')">Access</button>' +
  '</td></tr>';
}

function krRenderScripts(scripts) {
  const c = krEl("krScriptsPanel");
  c.innerHTML =
    '<div class="panel-card">' +
      '<div class="panel-title">Upload Script</div>' +
      '<div class="dropzone" id="krScriptDropzone" onclick="krEl(\'krNewScriptFile\').click()" ondragover="event.preventDefault();this.classList.add(\'dragover\');" ondragleave="this.classList.remove(\'dragover\');" ondrop="krHandleScriptDrop(event)">' +
        '<input id="krNewScriptFile" type="file" accept=".js" style="display:none" onchange="krHandleScriptFileSelected()">' +
        '<div class="dropzone-text"><span id="krScriptDropLabel">Drop script here or click to browse</span><small>.js files only</small></div>' +
      '</div>' +
      '<p class="field-hint">The filename becomes the KV key exactly as-is.</p>' +
      '<button class="btn-ok small-btn" style="padding:10px 18px;font-size:13px;margin-top:6px;" onclick="krUploadNewScript()">Upload Script</button>' +
    '</div>' +
    '<div class="panel-card">' +
      '<div class="panel-title">Scripts <button class="small-btn" onclick="loadKRScripts()">Refresh</button></div>' +
      '<table><thead><tr><th>Key</th><th></th></tr></thead><tbody>' + scripts.map(krScriptRow).join("") + '</tbody></table>' +
    '</div>' +
    '<input type="file" id="krReplaceFileInput" accept=".js" style="display:none" onchange="krHandleReplaceFileChosen()">';
}

window.krHandleScriptFileSelected = function () {
  const file = krEl("krNewScriptFile").files[0];
  if (file) krEl("krScriptDropLabel").textContent = file.name;
};
window.krHandleScriptDrop = function (e) {
  e.preventDefault();
  e.currentTarget.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (!file) return;
  krEl("krNewScriptFile").files = e.dataTransfer.files;
  krEl("krScriptDropLabel").textContent = file.name;
};
window.krUploadNewScript = function () {
  const file = krEl("krNewScriptFile").files[0];
  if (!file) { alert("Please select a .js file"); return; }
  if (!file.name.toLowerCase().endsWith(".js")) { alert("File must be a .js file"); return; }
  krDoScriptUpload(file.name, file);
};
window.krReplaceScript = function (key) {
  krReplaceTargetKey = key;
  krEl("krReplaceFileInput").click();
};
window.krHandleReplaceFileChosen = function () {
  const file = krEl("krReplaceFileInput").files[0];
  if (!file) return;
  krDoScriptUpload(krReplaceTargetKey, file);
};
function krDoScriptUpload(key, file) {
  const reader = new FileReader();
  reader.onload = function () {
    fetch(KR_API + "/script/upload?id=" + encodeURIComponent(key) + "&key=" + encodeURIComponent(KR_ADMIN_KEY), {
      method: "POST", body: reader.result
    }).then(function (r) { return r.json(); }).then(function (data) {
      alert(data.message || "Script Uploaded");
      loadKRScripts();
    }).catch(function (err) { alert(err.message); });
  };
  reader.readAsText(file);
}
window.krDeleteScript = async function (id) {
  if (!confirm("Delete this script?")) return;
  try { const r = await krApi("/script/delete?id=" + encodeURIComponent(id), { method: "POST" }); alert(r.message); loadKRScripts(); }
  catch (err) { alert(err.message); }
};

let krAccessModalUsers = [];
window.krOpenAccessModal = async function (scriptKey) {
  try { const res = await krApi("/users"); krAccessModalUsers = res.users || []; }
  catch (err) { alert(err.message); return; }
  const total = krAccessModalUsers.length;
  const allowed = krAccessModalUsers.filter(function (u) { return krEffectiveScripts(u).includes(scriptKey); }).length;
  krOpenModal(
    '<h2 style="margin-bottom:6px;">Allowed Users</h2>' +
    '<p class="field-hint">' + escapeHtml(scriptKey) + ' — <span id="krAccessCountLive">' + allowed + ' / ' + total + '</span> users</p>' +
    '<input id="krAccessSearch" class="search-box" placeholder="Search user..." style="margin-bottom:8px;">' +
    '<div id="krAccessUserList" class="script-checklist">' + krAccessModalUsers.map(function (u) { return krAccessUserRow(u, scriptKey); }).join("") + '</div>' +
    '<div class="modal-actions">' +
      '<button class="small-btn" onclick="krSelectAllAccessUsers()">Select All</button>' +
      '<button class="small-btn btn-ok" onclick="krSaveScriptAccess(\'' + escapeHtml(scriptKey) + '\')">Save</button>' +
    '</div>',
    true
  );
  krEl("krAccessUserList").addEventListener("change", function () { krUpdateAccessCount(); });
  krEl("krAccessSearch").oninput = function () {
    const kw = this.value.toLowerCase().trim();
    krEl("krAccessUserList").querySelectorAll(".script-check").forEach(function (row) {
      row.style.display = row.dataset.username.includes(kw) ? "" : "none";
    });
  };
};
function krAccessUserRow(user, scriptKey) {
  const checked = krEffectiveScripts(user).includes(scriptKey) ? "checked" : "";
  return '<label class="script-check" data-username="' + escapeHtml(user.username.toLowerCase()) + '"><input type="checkbox" data-token="' + escapeHtml(user.key) + '" ' + checked + '><span>' + escapeHtml(user.username) + '</span></label>';
}
window.krSelectAllAccessUsers = function () {
  krEl("krAccessUserList").querySelectorAll(".script-check").forEach(function (row) {
    if (row.style.display === "none") return;
    const box = row.querySelector("input[type=checkbox]");
    if (box) box.checked = true;
  });
  krUpdateAccessCount();
};
function krUpdateAccessCount() {
  const el = krEl("krAccessCountLive");
  if (!el) return;
  const boxes = krEl("krAccessUserList").querySelectorAll("input[type=checkbox]");
  const checked = Array.from(boxes).filter(function (b) { return b.checked; }).length;
  el.textContent = checked + " / " + boxes.length;
}
window.krSaveScriptAccess = async function (scriptKey) {
  const boxes = krEl("krAccessUserList").querySelectorAll("input[type=checkbox]");
  const updates = [];
  boxes.forEach(function (box) {
    const user = krAccessModalUsers.find(function (u) { return u.key === box.dataset.token; });
    if (!user) return;
    const effective = krEffectiveScripts(user);
    const wasChecked = effective.includes(scriptKey);
    if (box.checked === wasChecked) return;
    const updated = box.checked ? (effective.includes(scriptKey) ? effective : effective.concat([scriptKey])) : effective.filter(function (s) { return s !== scriptKey; });
    updates.push(krApi("/edituser", { method: "POST", body: JSON.stringify({ token: user.key, scripts: updated }) }));
  });
  if (!updates.length) { alert("No changes to save"); krCloseModal(); return; }
  try { await Promise.all(updates); alert(updates.length + " user(s) updated"); krCloseModal(); }
  catch (err) { alert(err.message); }
};

// ---------------- Tab wiring ----------------
// Panel element id for every tab this app knows about (legacy 3 + new Key Reset 6).
const ALL_TAB_PANELS = {
  users: "tabUsers",
  reviews: "tabReviews",
  settings: "tabSettings",
  krDashboard: "krDashboardPanel",
  krUsers: "krUsersPanel",
  krAdd: "krAddPanel",
  krStats: "krStatsPanel",
  krSettings: "krSettingsPanel",
  krScripts: "krScriptsPanel"
};

function krSetActiveTab(name) {
  document.querySelectorAll(".tab[data-tab]").forEach(function (t) { t.classList.remove("active"); });
  const btn = document.querySelector('.tab[data-tab="' + name + '"]');
  if (btn) btn.classList.add("active");
  Object.keys(ALL_TAB_PANELS).forEach(function (n) {
    const panel = krEl(ALL_TAB_PANELS[n]);
    if (panel) panel.style.display = (n === name) ? "" : "none";
  });
}

// Single unified tab-click router, replaces the old 3-tab-only handler in app.js.
document.querySelectorAll(".tab[data-tab]").forEach(function (tab) {
  tab.addEventListener("click", function () {
    const name = tab.getAttribute("data-tab");
    krSetActiveTab(name);
    if (name === "reviews" && typeof loadReviews === "function") loadReviews();
    else if (name === "settings") {
      if (typeof loadGuideVideo === "function") loadGuideVideo();
      if (typeof loadStatsOverride === "function") loadStatsOverride();
    }
    else if (name === "krDashboard") loadKRDashboard();
    else if (name === "krUsers") loadKRUsers();
    else if (name === "krAdd") loadKRAddUser();
    else if (name === "krStats") loadKRStatistics();
    else if (name === "krSettings") loadKRSettings();
    else if (name === "krScripts") loadKRScripts();
  });
});
