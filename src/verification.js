const USERNAME_PATTERN = /^[a-zA-Z0-9_]{5,32}$/;

// Confirms the typed handle is a real, resolvable Telegram username via the
// Bot API's getChat — rejects made-up/garbage text. This does NOT prove the
// person typing it owns that account (Telegram's Bot API has no general
// lookup-by-username for arbitrary private users without prior bot contact,
// so a full ownership proof needs the Login Widget or a DM-code flow) — it
// only stops the "type anything, get a credit" version of the exploit.
export async function verifyTidWithProvider(tid, botToken) {
  const trimmed = typeof tid === 'string' ? tid.trim() : '';
  const cleaned = trimmed.replace(/^@/, '');

  if (!USERNAME_PATTERN.test(cleaned)) {
    return { valid: false, reason: 'invalid_format' };
  }
  if (!botToken) {
    return { valid: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(
      'https://api.telegram.org/bot' + botToken + '/getChat?chat_id=' + encodeURIComponent('@' + cleaned)
    );
    const data = await res.json();
    if (!data || !data.ok || !data.result) {
      return { valid: false, reason: 'not_found' };
    }
    return { valid: true, normalizedTid: '@' + cleaned, lockKey: cleaned.toLowerCase() };
  } catch (e) {
    return { valid: false, reason: 'lookup_failed' };
  }
}
