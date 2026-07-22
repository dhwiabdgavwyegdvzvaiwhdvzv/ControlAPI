

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(env);
  const headers = { 'Vary': 'Origin' };

  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else if (!origin) {
    
    headers['Access-Control-Allow-Origin'] = allowed[0] || '';
  }
  

  return headers;
}

export function handleOptions(request, env) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, env),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(request, env);
  for (const key in cors) headers.set(key, cors[key]);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  return new Response(response.body, { status: response.status, headers });
}
