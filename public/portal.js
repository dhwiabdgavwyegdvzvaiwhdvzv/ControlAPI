
// ---------- Dynamic Neon Color Generation Engine ----------
// Fresh random hue pair on every page load (initial load AND hard reload —
// no persistence by design, matches spec).
(function () {
  var hueA = Math.floor(Math.random() * 360);
  var hueB = (hueA + 110 + Math.floor(Math.random() * 80)) % 360;
  var root = document.documentElement.style;
  root.setProperty('--neon-a', hueA);
  root.setProperty('--neon-b', hueB);
})();

// ---------- Password Gate ----------
// Client-side convenience gate only (mirrors "my key project"'s own model —
// the real security boundary for each destination panel is its own backend
// auth). Reuses the same password/reset-key values already used by
// "my key project" so there is effectively one shared front-door password.
var GATE_PASSWORD = 'Ranuubiguu2004zZ';
var GATE_RESET_KEY = '4672';
var GATE_STORAGE_KEY = 'biguudev_portal_auth';

function $(id) { return document.getElementById(id); }

function showSelector() {
  $('gate').style.display = 'none';
  $('selector').classList.add('show');
}

function showGateError(msg) {
  $('gateError').textContent = msg;
}

function attemptGate() {
  var val = $('gatePassword').value;
  if (val === GATE_PASSWORD) {
    localStorage.setItem(GATE_STORAGE_KEY, '1');
    showSelector();
  } else {
    showGateError('Incorrect password');
  }
}

function toggleForgot() {
  $('gateReset').classList.toggle('show');
}

function attemptGateReset() {
  var val = $('gateResetKey').value.trim();
  if (val === GATE_RESET_KEY) {
    localStorage.setItem(GATE_STORAGE_KEY, '1');
    showSelector();
    setTimeout(function () {
      showGateError('');
      alert('Your password is: ' + GATE_PASSWORD);
    }, 300);
  } else {
    showGateError('Incorrect reset key');
  }
}

if (localStorage.getItem(GATE_STORAGE_KEY) === '1') {
  showSelector();
}
