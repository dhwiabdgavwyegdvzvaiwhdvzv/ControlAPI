

const MAX_TID_LENGTH = 128;

export async function verifyTidWithProvider(tid) {
  const trimmed = typeof tid === 'string' ? tid.trim() : '';
  if (!trimmed || trimmed.length > MAX_TID_LENGTH) {
    return { valid: false };
  }
  return { valid: true, normalizedTid: trimmed, lockKey: trimmed.toLowerCase() };
}
