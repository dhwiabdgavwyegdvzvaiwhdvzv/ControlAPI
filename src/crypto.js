

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
