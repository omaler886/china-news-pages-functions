function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export { withCors, toErrorMessage };
