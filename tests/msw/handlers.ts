import { http, HttpResponse } from "msw";

// Default handlers. Individual tests add deterministic stubs with `server.use(...)`.
// Kept intentionally small - unit tests register their own per-case handlers and
// `server.resetHandlers()` (in tests/setup.ts) clears them after each test.
export const handlers = [
  http.get("https://msw.test/ping", () => HttpResponse.json({ ok: true })),
];
