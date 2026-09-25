import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server";
import type { JevPayload } from "@/lib/jev-log";

// os is a Node ESM built-in - its namespace export isn't configurable, so
// vi.spyOn can't patch it directly. Route through a mutable override hook
// instead, defaulting to the real implementation (same pattern as
// skill-usage-route.test.ts).
const jevHome: { homedir?: typeof os.homedir } = {};

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    ...actual,
    homedir: (...args: Parameters<typeof actual.homedir>) =>
      jevHome.homedir ? jevHome.homedir(...args) : actual.homedir(...args),
  };
});

// sessions GET filters project folders through isRealRepo (needs a real
// on-disk repo behind the folder name) and getLiveSessionIds (shells out to
// lsof). Both are stubbed so the route's own file walk is what gets tested.
vi.mock("@/lib/project-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/project-utils")>();
  return { ...actual, isRealRepo: () => true };
});
vi.mock("@/lib/live-sessions", () => ({
  getLiveSessionIds: async () => new Set(["live-session"]),
}));

// Same-origin + trusted Host is what lib/route-guard.ts accepts; the foreign
// set carries a cross-site Sec-Fetch-Site and a foreign Origin so it is denied
// whichever signal the guard reads.
const SAME_SITE = { "sec-fetch-site": "same-origin", host: "localhost:3003", origin: "http://localhost:3003" };
const FOREIGN = { "sec-fetch-site": "cross-site", host: "localhost:3003", origin: "https://evil.example" };

function jsonReq(url: string, body: unknown, method = "DELETE", headers: Record<string, string> = SAME_SITE) {
  return new Request(url, { method, headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
}

// ── claude/sessions ─────────────────────────────────────────────────────────
describe("claude/sessions", () => {
  let tmpHome: string;
  let projectsDir: string;
  const username = os.userInfo().username;

  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/sessions/route");
  }

  function writeSession(folder: string, id: string, lines: unknown[]) {
    const dir = path.join(projectsDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, `${id}.jsonl`);
    fs.writeFileSync(fp, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    return fp;
  }

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-route-"));
    jevHome.homedir = () => tmpHome;
    projectsDir = path.join(tmpHome, ".claude", "projects");
    fs.mkdirSync(projectsDir, { recursive: true });
  });

  afterEach(() => {
    delete jevHome.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  describe("DELETE", () => {
    it("returns 400 when filePath is missing or not a string", async () => {
      const { DELETE } = await loadRoute();
      expect((await DELETE(jsonReq("http://localhost/api/claude/sessions", {}), undefined)).status).toBe(400);
      expect((await DELETE(jsonReq("http://localhost/api/claude/sessions", { filePath: 42 }), undefined)).status).toBe(400);
    });

    it("refuses a ../ traversal that escapes ~/.claude/projects", async () => {
      const outside = path.join(tmpHome, "victim.jsonl");
      fs.writeFileSync(outside, "{}\n");
      const { DELETE } = await loadRoute();
      const res = await DELETE(jsonReq("http://localhost/api/claude/sessions", {
        filePath: path.join(projectsDir, "proj", "..", "..", "..", "victim.jsonl"),
      }), undefined);
      expect(res.status).toBe(403);
      expect(fs.existsSync(outside)).toBe(true);
    });

    it("refuses a sibling dir that merely shares the projects prefix", async () => {
      const sibling = path.join(tmpHome, ".claude", "projects-evil");
      fs.mkdirSync(sibling, { recursive: true });
      const target = path.join(sibling, "x.jsonl");
      fs.writeFileSync(target, "{}\n");
      const { DELETE } = await loadRoute();
      const res = await DELETE(jsonReq("http://localhost/api/claude/sessions", { filePath: target }), undefined);
      expect(res.status).toBe(403);
      expect(fs.existsSync(target)).toBe(true);
    });

    it("refuses non-.jsonl files inside the projects dir", async () => {
      const target = path.join(projectsDir, "proj", "notes.txt");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "hi");
      const { DELETE } = await loadRoute();
      const res = await DELETE(jsonReq("http://localhost/api/claude/sessions", { filePath: target }), undefined);
      expect(res.status).toBe(400);
      expect(fs.existsSync(target)).toBe(true);
    });

    it("returns 404 for a .jsonl that does not exist", async () => {
      const { DELETE } = await loadRoute();
      const res = await DELETE(jsonReq("http://localhost/api/claude/sessions", {
        filePath: path.join(projectsDir, "proj", "missing.jsonl"),
      }), undefined);
      expect(res.status).toBe(404);
    });

    it("deletes a real session file under the tmp HOME and returns ok", async () => {
      const fp = writeSession(`-Users-${username}-Sites-proj`, "abc", [{ type: "user", message: { content: "hi" } }]);
      const { DELETE } = await loadRoute();
      const res = await DELETE(jsonReq("http://localhost/api/claude/sessions", { filePath: fp }), undefined);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(fs.existsSync(fp)).toBe(false);
    });

    it("refuses a foreign-Origin caller with 403 and leaves the file alone", async () => {
      const fp = writeSession(`-Users-${username}-Sites-proj`, "abc", [{ type: "user", message: { content: "hi" } }]);
      const { DELETE } = await loadRoute();
      const res = await DELETE(jsonReq("http://localhost/api/claude/sessions", { filePath: fp }, "DELETE", FOREIGN), undefined);
      expect(res.status).toBe(403);
      expect(fs.existsSync(fp)).toBe(true);
    });
  });

  describe("GET", () => {
    it("returns an empty projects list when the projects dir is empty", async () => {
      const { GET } = await loadRoute();
      const res = await GET(new Request("http://localhost/api/claude/sessions"), undefined);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ projects: [] });
    });

    it("lists 1 session with its custom title, first message and live flag", async () => {
      const folder = `-Users-${username}-Sites-proj`;
      writeSession(folder, "live-session", [
        { type: "custom-title", customTitle: "My Title", timestamp: "2026-09-01T10:00:00.000Z" },
        { type: "user", message: { content: [{ type: "text", text: "first prompt" }] }, timestamp: "2026-09-01T10:00:01.000Z" },
        { type: "assistant", message: { content: [] } },
      ]);
      // Folder for another user must be skipped.
      writeSession("-Users-someoneelse-Sites-proj", "other", [{ type: "user", message: { content: "x" } }]);
      const { GET } = await loadRoute();
      const res = await GET(new Request("http://localhost/api/claude/sessions"), undefined);
      const body = await res.json();
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0].project).toBe(folder);
      expect(body.projects[0].path).toBe(`/Users/${username}/Sites/proj`);
      const s = body.projects[0].sessions[0];
      expect(s.id).toBe("live-session");
      expect(s.customTitle).toBe("My Title");
      expect(s.title).toBe("first prompt");
      expect(s.createdAt).toBe("2026-09-01T10:00:00.000Z");
      expect(s.live).toBe(true);
      expect(s.sizeLabel).toMatch(/B$/);
    });
  });
});

// ── claude/machines ─────────────────────────────────────────────────────────
describe("claude/machines", () => {
  const env = { MACHINES: process.env.MACHINES, LOCAL_MACHINE_ID: process.env.LOCAL_MACHINE_ID };

  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/machines/route");
  }

  afterEach(() => {
    process.env.MACHINES = env.MACHINES;
    process.env.LOCAL_MACHINE_ID = env.LOCAL_MACHINE_ID;
    if (env.MACHINES === undefined) delete process.env.MACHINES;
    if (env.LOCAL_MACHINE_ID === undefined) delete process.env.LOCAL_MACHINE_ID;
  });

  it("returns only the local machine when MACHINES is unset", async () => {
    delete process.env.MACHINES;
    process.env.LOCAL_MACHINE_ID = "m4";
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/claude/machines"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.machines).toHaveLength(1);
    expect(body.machines[0]).toMatchObject({ id: "m4", ip: "127.0.0.1", online: true, isLocal: true });
  });

  it("adds an online peer from MACHINES and drops an unreachable one", async () => {
    process.env.MACHINES = "10.0.0.2:3003, 10.0.0.9:3003";
    process.env.LOCAL_MACHINE_ID = "m4";
    server.use(
      http.get("http://10.0.0.2:3003/api/claude/lan", () => HttpResponse.json({ hostname: "pi5", model: "Cortex-A76" })),
      http.get("http://10.0.0.9:3003/api/claude/lan", () => HttpResponse.error()),
    );
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/claude/machines"));
    const body = await res.json();
    expect(body.machines.map((m: { id: string }) => m.id)).toEqual(["m4", "10.0.0.2:3003"]);
    expect(body.machines[1]).toMatchObject({ hostname: "pi5", model: "Cortex-A76", online: true, isLocal: false, port: 3003 });
  });
});

// ── claude/skills PUT ───────────────────────────────────────────────────────
describe("claude/skills PUT", () => {
  let tmpHome: string;

  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/skills/route");
  }

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "skills-route-"));
    jevHome.homedir = () => tmpHome;
    fs.mkdirSync(path.join(tmpHome, ".claude", "commands"), { recursive: true });
  });

  afterEach(() => {
    delete jevHome.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns 403 for a foreign-Origin caller before touching the body", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonReq("http://localhost/api/claude/skills", { filePath: "x", content: "y" }, "PUT", FOREIGN), undefined);
    expect(res.status).toBe(403);
  });

  it("returns 400 when filePath or content is missing", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonReq("http://localhost/api/claude/skills", { filePath: "/x/CLAUDE.md" }, "PUT"), undefined);
    expect(res.status).toBe(400);
  });

  it("returns 403 for a .md outside ~/.claude that is not a CLAUDE.md", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonReq("http://localhost/api/claude/skills", { filePath: path.join(tmpHome, "notes.md"), content: "x" }, "PUT"), undefined);
    expect(res.status).toBe(403);
  });

  it("returns 403 for a non-whitelisted file type inside ~/.claude", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonReq("http://localhost/api/claude/skills", { filePath: path.join(tmpHome, ".claude", "settings.json"), content: "{}" }, "PUT"), undefined);
    expect(res.status).toBe(403);
  });

  it("writes a command .md under ~/.claude/commands and reads it back", async () => {
    const target = path.join(tmpHome, ".claude", "commands", "hello.md");
    const { PUT } = await loadRoute();
    const res = await PUT(jsonReq("http://localhost/api/claude/skills", { filePath: target, content: "# hello\n" }, "PUT"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fs.readFileSync(target, "utf-8")).toBe("# hello\n");
  });
});

// ── claude/jev ──────────────────────────────────────────────────────────────
// JEV_LOG_PATH is resolved once at module load, and the route keeps a 30 s
// in-memory cache, so every case gets a fresh module instance.
async function loadJevRoute() {
  vi.resetModules();
  return import("@/app/api/claude/jev/route");
}

async function getJev(query = ""): Promise<{ status: number; body: JevPayload }> {
  const { GET } = await loadJevRoute();
  const res = await GET(new Request(`http://localhost/api/claude/jev${query}`), undefined);
  return { status: res.status, body: await res.json() };
}

describe("claude/jev", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "jev-route-"));
    jevHome.homedir = () => tmpHome;
  });

  afterEach(() => {
    delete jevHome.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function writeLog(lines: unknown[]) {
    const dir = path.join(tmpHome, ".claude", "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "jev.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  }

  it("returns 200 with aggregated data when the log has rows", async () => {
    const now = new Date().toISOString();
    writeLog([
      { ts: now, session_id: "s1", project: "claude", status: "routed", tier: "sonnet", conf: 0.9, latency_ms: 400, input_tokens: 500, output_tokens: 80 },
      { ts: now, session_id: "s1", project: "claude", status: "skipped", reason: "slash", prompt: "/tabs" },
      { ts: now, session_id: "s2", project: "bheng", status: "error", reason: "TypeError", latency_ms: 120 },
    ]);
    const { status, body } = await getJev("?days=7");
    expect(status).toBe(200);
    expect(body.health).toBe("live");
    expect(body.totals.calls).toBe(3);
    expect(body.totals.routed).toBe(1);
    expect(body.totals.errors).toBe(1);
    expect(body.tiers.sonnet).toBe(1);
    expect(body.sessions).toHaveLength(2);
    expect(body.recent).toHaveLength(3);
    expect(body.projects).toEqual(["bheng", "claude"]);
    expect(body.days).toBe(7);
    expect(body.logPath).toContain("jev.jsonl");
  });

  it("returns 200 and the empty never shape when the log file is missing", async () => {
    const { status, body } = await getJev();
    expect(status).toBe(200);
    expect(body.health).toBe("never");
    expect(body.totals.calls).toBe(0);
    expect(body.daily).toEqual([]);
    expect(body.sessions).toEqual([]);
    expect(body.recent).toEqual([]);
    expect(body.projects).toEqual([]);
    expect(body.days).toBe(30);
  });

  it("clamps days to 1..365 and defaults a bad value to 30", async () => {
    expect((await getJev("?days=0")).body.days).toBe(1);
    expect((await getJev("?days=-5")).body.days).toBe(1);
    expect((await getJev("?days=9999")).body.days).toBe(365);
    expect((await getJev("?days=abc")).body.days).toBe(30);
    expect((await getJev()).body.days).toBe(30);
  });

  it("filters to one project while still listing them all", async () => {
    const now = new Date().toISOString();
    writeLog([
      { ts: now, session_id: "s1", project: "claude", status: "routed", tier: "opus" },
      { ts: now, session_id: "s2", project: "bheng", status: "routed", tier: "haiku" },
    ]);
    const { body } = await getJev("?days=7&project=claude");
    expect(body.project).toBe("claude");
    expect(body.totals.calls).toBe(1);
    expect(body.tiers).toEqual({ haiku: 0, sonnet: 0, opus: 1, fable: 0 });
    expect(body.projects).toEqual(["bheng", "claude"]);
  });
});
