import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
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

describe("API route exports", () => {
  describe("monitor/sessions", () => {
    it("exports GET handler", async () => {
      const mod = await import("@/app/api/claude/sessions/route");
      expect(typeof mod.GET).toBe("function");
    });
    it("exports DELETE handler", async () => {
      const mod = await import("@/app/api/claude/sessions/route");
      expect(typeof mod.DELETE).toBe("function");
    });
  });

  describe("monitor/machines", () => {
    it("exports GET handler", async () => {
      const mod = await import("@/app/api/claude/machines/route");
      expect(typeof mod.GET).toBe("function");
    });
  });

  describe("monitor/skills", () => {
    it("exports GET handler", async () => {
      const mod = await import("@/app/api/claude/skills/route");
      expect(typeof mod.GET).toBe("function");
    });
    it("exports PUT handler", async () => {
      const mod = await import("@/app/api/claude/skills/route");
      expect(typeof mod.PUT).toBe("function");
    });
  });

  describe("monitor/settings", () => {
    it("exports GET handler", async () => {
      const mod = await import("@/app/api/claude/settings/route");
      expect(typeof mod.GET).toBe("function");
    });
  });

  describe("qr", () => {
    it("exports GET handler", async () => {
      const mod = await import("@/app/api/qr/route");
      expect(typeof mod.GET).toBe("function");
    });
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

  it("exports GET handler", async () => {
    const mod = await loadJevRoute();
    expect(typeof mod.GET).toBe("function");
  });

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
