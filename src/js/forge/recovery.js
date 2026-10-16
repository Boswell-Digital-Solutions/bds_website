// Account bootstrap is idempotent; other writes must never be replayed here.
// Five eight-second BFF attempts plus these delays allow roughly a minute for
// an idle service to start, without increasing any server request deadline.
const DELAYS_MS = [2000, 4000, 8000, 8000];
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function recoverAccountRequest(path, method, request, { onRetry, wait = sleep } = {}) {
  let response = await request();
  const verb = method.toUpperCase();
  const safe = verb === "GET" || (verb === "POST" && path === "/v1/account/provision");
  if (!safe) return response;

  for (let attempt = 0; attempt < DELAYS_MS.length && TRANSIENT_STATUSES.has(response.status); attempt++) {
    onRetry?.({ attempt: attempt + 1, delayMs: DELAYS_MS[attempt] });
    await response.body?.cancel();
    await wait(DELAYS_MS[attempt]);
    response = await request();
  }
  return response;
}
