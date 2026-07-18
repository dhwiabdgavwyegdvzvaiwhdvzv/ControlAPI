

const DEFAULT_ITERATIONS = 100000;
const HASH_BITS = 256;

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pbkdf2(password, saltBytes, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    keyMaterial,
    HASH_BITS
  );
  return new Uint8Array(bits);
}

export async function createPasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, DEFAULT_ITERATIONS);
  return {
    algorithm: 'PBKDF2-SHA256',
    iterations: DEFAULT_ITERATIONS,
    salt: toBase64(salt),
    hash: toBase64(hash)
  };
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.salt || !stored.hash || !stored.iterations) return false;
  const salt = fromBase64(stored.salt);
  const computed = await pbkdf2(password, salt, stored.iterations);
  const expected = fromBase64(stored.hash);
  return timingSafeEqual(computed, expected);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function generateSessionToken() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export const DUMMY_PASSWORD_HASH = {
  algorithm: 'PBKDF2-SHA256',
  iterations: DEFAULT_ITERATIONS,
  salt: 'LZkZjTWMT/azUWorRrGXpw==',
  hash: 'uNY3/7RJmZ+9Ppnu/9Bgy0PgBQqxGyGtdMeL8NAxNYE='
};

const TELEGRAM_AUTH_MAX_AGE_SECONDS = 86400;

function toHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    diff |= (i < a.length ? a.charCodeAt(i) : 0) ^ (i < b.length ? b.charCodeAt(i) : 0);
  }
  return diff === 0;
}

// Verifies a Telegram Login Widget payload per Telegram's documented algorithm:
// https://core.telegram.org/widgets/login#checking-authorization
export async function verifyTelegramAuth(data, botToken) {
  if (!data || typeof data !== 'object' || !botToken) return { valid: false };
  const { hash, ...rest } = data;
  if (!hash || typeof hash !== 'string') return { valid: false };

  const dataCheckString = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== null && rest[k] !== '')
    .sort()
    .map((k) => k + '=' + rest[k])
    .join('\n');

  const enc = new TextEncoder();
  const secretKeyBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(botToken)));
  const hmacKey = await crypto.subtle.importKey('raw', secretKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuffer = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(dataCheckString));
  const computedHex = toHex(new Uint8Array(sigBuffer));

  if (!timingSafeEqualHex(computedHex, String(hash).toLowerCase())) {
    return { valid: false, reason: 'bad_signature' };
  }

  const authDate = Number(rest.auth_date);
  if (!authDate || (Date.now() / 1000 - authDate) > TELEGRAM_AUTH_MAX_AGE_SECONDS) {
    return { valid: false, reason: 'expired' };
  }

  if (!rest.id) return { valid: false, reason: 'missing_id' };

  return {
    valid: true,
    id: String(rest.id),
    firstName: rest.first_name ? String(rest.first_name) : '',
    lastName: rest.last_name ? String(rest.last_name) : '',
    username: rest.username ? String(rest.username) : null
  };
}
