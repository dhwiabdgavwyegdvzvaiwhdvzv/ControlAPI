

export function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function errorResponse(code, message, status) {
  return jsonResponse({ error: { code, message } }, status);
}
