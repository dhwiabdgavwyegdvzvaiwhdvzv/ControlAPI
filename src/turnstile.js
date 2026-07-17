

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken(token, env, remoteIp) {
  if (!token || typeof token !== 'string') {
    return { success: false, reason: 'missing' };
  }
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error('TURNSTILE_SECRET_KEY is not configured — refusing to authenticate.');
    return { success: false, reason: 'network_error' };
  }

  const body = new URLSearchParams();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);

  let result;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    result = await res.json();
  } catch (err) {
    console.error('Turnstile siteverify request failed:', err && err.stack ? err.stack : err);
    return { success: false, reason: 'network_error' };
  }

  if (result && result.success === true) {
    return { success: true, reason: 'ok' };
  }

  const codes = (result && result['error-codes']) || [];
  console.error('Turnstile verification rejected:', codes.length ? codes.join(', ') : 'no error-codes returned');

  if (codes.includes('timeout-or-duplicate')) {
    return { success: false, reason: 'expired' };
  }
  return { success: false, reason: 'invalid' };
}
