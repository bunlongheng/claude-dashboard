import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NextRequest } from "next/server";

// Regression tests for the 4 recently-landed security fixes:
//   1. settings/route.ts   - full settings.local.json contents gated behind requireBearerOrSameSite
//   2. search/route.ts     - search results gated behind requireBearerOrSameSite
//   3. brain/route.ts      - full config/memory dump gated behind requireBearerOrSameSite
//   4. project-icon/route.ts - path traversal on ?project= is rejected / contained to SITES_DIR
//
// (lib/db/simple-auth.ts's timingSafePasswordEqual already has equal/unequal/no-throw
// coverage via tests/unit/simple-auth.test.ts's signIn() cases - not duplicated here.)

// os is a Node ESM built-in - its namespace export isn't configurable, so
// vi.spyOn can't patch it directly. Route through a mutable override hook
// instead, defaulting to the real implementation (same pattern used by
// tests/unit/skill-usage-route.test.ts).
const overrides: { homedir?: typeof os.homedir } = {};

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    ...actual,
    homedir: (...args: Parameters<typeof actual.homedir>) =>
      overrides.homedir ? overrides.homedir(...args) : actual.homedir(...args),
  };
});

const AUTHORIZED_HEADERS = { "sec-fetch-site": "same-origin", host: "localhost:3003" };
const UNAUTHORIZED_HEADERS = { "sec-fetch-site": "cross-site" };

describe("GET /api/claude/settings", () => {
  let tmpHome: string;

  // CLAUDE_DIR / SITES_DIR are computed once at module load from os.homedir(),
  // so each test needs a fresh module instance to pick up its own tmpHome override.
  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/settings/route");
  }

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "settings-route-"));
    overrides.homedir = () => tmpHome;

    fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, ".claude", "settings.json"),
      JSON.stringify({ foo: "bar", baz: 1 })
    );
    fs.writeFileSync(
      path.join(tmpHome, ".claude", "settings.local.json"),
      JSON.stringify({ secretKey: "shh-super-secret" })
    );

    const projDir = path.join(tmpHome, "Sites", "proj1", ".claude");
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, "settings.json"), JSON.stringify({ a: 1 }));
    fs.writeFileSync(path.join(projDir, "settings.local.json"), JSON.stringify({ token: "proj-secret-xyz" }));
  });

  afterEach(() => {
    delete overrides.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns only the slim (key-count) shape for an unauthorized cross-site caller, never full contents", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      new Request("http://localhost/api/claude/settings", { headers: UNAUTHORIZED_HEADERS })
    );
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.global.settings).toEqual({ _keys: 2 });
    expect(data.global.localSettings).toEqual({ _keys: 1 });
    expect(data.projects[0].settings).toEqual({ _keys: 1 });
    expect(data.projects[0].localSettings).toEqual({ _keys: 1 });

    // Belt and suspenders: the actual secret values must never appear anywhere
    // in the unauthorized payload.
    const raw = JSON.stringify(data);
    expect(raw).not.toContain("shh-super-secret");
    expect(raw).not.toContain("proj-secret-xyz");
    expect(raw).not.toContain("bar");
  });

  it("returns full settings contents for an authorized same-origin caller", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      new Request("http://localhost/api/claude/settings", { headers: AUTHORIZED_HEADERS })
    );
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.global.settings).toEqual({ foo: "bar", baz: 1 });
    expect(data.global.localSettings).toEqual({ secretKey: "shh-super-secret" });
    expect(data.projects[0].settings).toEqual({ a: 1 });
    expect(data.projects[0].localSettings).toEqual({ token: "proj-secret-xyz" });
  });

  it("also downgrades an authorized caller to slim when ?slim=1 is passed explicitly", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      new Request("http://localhost/api/claude/settings?slim=1", { headers: AUTHORIZED_HEADERS })
    );
    const data = await res.json();
    expect(data.global.settings).toEqual({ _keys: 2 });
  });
});

describe("GET /api/claude/search", () => {
  it("rejects an unauthorized cross-site caller with 403 Forbidden", async () => {
    const { GET } = await import("@/app/api/claude/search/route");
    const res = await GET(
      new Request("http://localhost/api/claude/search?q=test", { headers: UNAUTHORIZED_HEADERS })
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data).toEqual({ error: "Forbidden" });
  });

  it("rejects an anonymous caller (no bearer, no Sec-Fetch-Site) with 403", async () => {
    const { GET } = await import("@/app/api/claude/search/route");
    const res = await GET(new Request("http://localhost/api/claude/search?q=test"));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/claude/brain", () => {
  it("rejects an unauthorized cross-site caller with 403 Forbidden", async () => {
    const { GET } = await import("@/app/api/claude/brain/route");
    const res = await GET(new Request("http://localhost/api/claude/brain", { headers: UNAUTHORIZED_HEADERS }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data).toEqual({ error: "Forbidden" });
  });

  it("rejects an anonymous caller (no bearer, no Sec-Fetch-Site) with 403", async () => {
    const { GET } = await import("@/app/api/claude/brain/route");
    const res = await GET(new Request("http://localhost/api/claude/brain"));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/claude/project-icon", () => {
  let tmpHome: string;
  const originalFetch = global.fetch;

  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/project-icon/route");
  }

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "project-icon-"));
    overrides.homedir = () => tmpHome;
    // Stub the local-apps favicon fallback fetch so tests never hit the real
    // network / a real locally-running local-apps server on :9876.
    global.fetch = vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
  });

  afterEach(() => {
    delete overrides.homedir;
    global.fetch = originalFetch;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('rejects the literal ".." project name with 400', async () => {
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://localhost/api/claude/project-icon?project=.."));
    expect(res.status).toBe(400);
  });

  it('rejects a ".." path segment mixed into the project param with 400', async () => {
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://localhost/api/claude/project-icon?project=foo/.."));
    expect(res.status).toBe(400);
  });

  it("never reads outside SITES_DIR: a traversal-shaped project value resolves (if at all) to a name still contained inside SITES_DIR", async () => {
    // Plant a sensitive file OUTSIDE Sites/ (a sibling of it) that traversal
    // would need to reach.
    fs.writeFileSync(path.join(tmpHome, "outside-secret.png"), Buffer.from("SECRET-BYTES"));
    fs.mkdirSync(path.join(tmpHome, "Sites"), { recursive: true });

    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://localhost/api/claude/project-icon?project=../x"));
    // Only the last path segment ("x") is used as the lookup name, so this
    // can never escape SITES_DIR - it 404s (no such project) rather than
    // leaking the outside file, and is never a 200 with the secret bytes.
    expect(res.status).toBe(404);
  });

  it("serves the favicon for a normal, existing project name", async () => {
    const iconDir = path.join(tmpHome, "Sites", "demo", "public");
    fs.mkdirSync(iconDir, { recursive: true });
    const bytes = Buffer.from("PNGDATA");
    fs.writeFileSync(path.join(iconDir, "favicon.png"), bytes);

    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://localhost/api/claude/project-icon?project=demo"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.equals(bytes)).toBe(true);
  });

  it("404s cleanly for a normal but absent project name", async () => {
    fs.mkdirSync(path.join(tmpHome, "Sites"), { recursive: true });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://localhost/api/claude/project-icon?project=doesnotexist"));
    expect(res.status).toBe(404);
  });
});
