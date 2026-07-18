

export async function safeJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

export function getBearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function getDeviceId(request) {
  const id = request.headers.get('X-Device-Id');
  return id ? id.trim() : null;
}

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,64}$/;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9-]{8,128}$/;
const MAX_PASSWORD_LENGTH = 256;

export function isValidUsername(value) {
  return typeof value === 'string' && USERNAME_PATTERN.test(value);
}

export function isValidPassword(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= MAX_PASSWORD_LENGTH;
}

const MIN_NEW_PASSWORD_LENGTH = 8;

export function isValidNewPassword(value) {
  return typeof value === 'string' && value.length >= MIN_NEW_PASSWORD_LENGTH && value.length <= MAX_PASSWORD_LENGTH;
}

export function isValidDeviceId(value) {
  return typeof value === 'string' && DEVICE_ID_PATTERN.test(value);
}

export function normalizeUsername(value) {
  return String(value).trim().toLowerCase();
}

export function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

const EXPIRY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidExpiryDate(value) {
  return typeof value === 'string' && EXPIRY_DATE_PATTERN.test(value) && !isNaN(Date.parse(value));
}

export function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return Date.now() > new Date(expiresAt + 'T23:59:59.999Z').getTime();
}
