import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Behavioral tests for app/api/claude/claude-sessions/[sessionId]/input/route.ts,
// the TTY-injection route. Scoped to the auth guard + input validation only -
// every case here returns before the route ever reaches findTtyForCwd()/
// injectToTty() (which shell out via child_process.execSync to pgrep/lsof/
// osascript). That exec layer was deliberately NOT exercised: vi.mock("child_process")
// does not intercept execSync when it's called from a module nested under this
// route (confirmed by a throwaway repro - the mock only takes effect for a
// bare specifier imported directly by the test file itself, not transitively),
// and getting it to intercept reliably would require a vitest.config.ts
// server.deps.inline change, which is out of scope (test files only, no source/
// config edits). Rather than a mock that silently doesn't apply - which would
// let real pgrep/lsof/osascript run during `vitest run` - the success/injection
// path is skipped entirely here.
//
// os.homedir() is overridden the same way as tests/unit/claude-routes.test.ts
// so the route's module-level CLAUDE_DIR const points at a tmp fixture, which
// is enough to test the 404 "session not found" branch without touching exec.
//
// app/api/claude/claude-sessions/[sessionId]/stream/route.ts (SSE) was also
// left out: it opens a long-lived ReadableStream tied to a setInterval poll
// loop, which doesn't resolve to a single Response the way the other routes
// here do - not a clean fit for this fixture/assert-JSON-shape pattern.

const overrides: { homedir?: typeof os.homedir } = {};

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    ...actual,
    homedir: (...args: Parameters<typeof actual.homedir>) =>
      overrides.homedir ? overrides.homedir(...args) : actual.homedir(...args),
  };
});

let tmpHome: string;

function loadRoute() {
  vi.resetModules();
  return import("@/app/api/claude/claude-sessions/[sessionId]/input/route");
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-sessions-input-"));
  overrides.homedir = () => tmpHome;
});

afterEach(() => {
  delete overrides.homedir;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("POST /api/claude/claude-sessions/[sessionId]/input", () => {
  it("rejects an unauthorized cross-site request with 403", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/claude/claude-sessions/sess1/input", {
      method: "POST",
      body: JSON.stringify({ text: "echo hi" }),
      headers: { "sec-fetch-site": "cross-site", host: "localhost:3003" },
    });
    const res = await POST(req, { params: Promise.resolve({ sessionId: "sess1" }) });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Forbidden");
  });

  it("rejects an anonymous request with no auth signal at all", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/claude/claude-sessions/sess1/input", {
      method: "POST",
      body: JSON.stringify({ text: "echo hi" }),
    });
    const res = await POST(req, { params: Promise.resolve({ sessionId: "sess1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 for empty/whitespace-only text once authorized", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/claude/claude-sessions/sess1/input", {
      method: "POST",
      body: JSON.stringify({ text: "   " }),
      headers: { "sec-fetch-site": "same-origin", host: "localhost:3003" },
    });
    const res = await POST(req, { params: Promise.resolve({ sessionId: "sess1" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ ok: false, error: "empty" });
  });

  it("returns 404 when the session id has no matching session file", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/claude/claude-sessions/does-not-exist/input", {
      method: "POST",
      body: JSON.stringify({ text: "echo hi" }),
      headers: { "sec-fetch-site": "same-origin", host: "localhost:3003" },
    });
    const res = await POST(req, { params: Promise.resolve({ sessionId: "does-not-exist" }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toEqual({ ok: false, error: "session not found" });
  });

  it("rejects an unsafe sessionId (path-traversal shaped) as not-found, never touching the real filesystem lookup", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/claude/claude-sessions/x/input", {
      method: "POST",
      body: JSON.stringify({ text: "echo hi" }),
      headers: { "sec-fetch-site": "same-origin", host: "localhost:3003" },
    });
    const res = await POST(req, { params: Promise.resolve({ sessionId: "../../etc/passwd" }) });
    expect(res.status).toBe(404);
  });

  it("rejects a wrong bearer token with 403", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/claude/claude-sessions/sess1/input", {
      method: "POST",
      body: JSON.stringify({ text: "echo hi" }),
      headers: { authorization: "Bearer definitely-not-the-real-token" },
    });
    const res = await POST(req, { params: Promise.resolve({ sessionId: "sess1" }) });
    expect(res.status).toBe(403);
  });
});
