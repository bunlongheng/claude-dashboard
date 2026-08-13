import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Behavioral tests for two data-shaping routes, using the fixture/mock pattern
// from tests/unit/skill-usage-route.test.ts (override os.homedir() so the
// route's module-level PROJECTS_DIR/CLAUDE_DIR const points at a tmp fixture).
//
// app/api/claude/sessions/route.ts was skipped: it depends on lib/project-utils
// (isRealRepo/resolveFolderPath, which requires the folder-derived path to be a
// real directory on disk - not something a tmp fixture can satisfy without also
// faking the OS-level directory tree) and lib/live-sessions.ts (shells out to
// `lsof`, explicitly excluded from unit coverage in vitest.config.ts). Neither
// mocks cleanly without touching real system state, so tool-usage + token-stats
// were used instead.

const overrides: { homedir?: typeof os.homedir } = {};

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    ...actual,
    homedir: (...args: Parameters<typeof actual.homedir>) =>
      overrides.homedir ? overrides.homedir(...args) : actual.homedir(...args),
  };
});

function writeFixture(tmpHome: string, project: string, file: string, lines: unknown[]) {
  const dir = path.join(tmpHome, ".claude", "projects", project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

describe("GET /api/claude/tool-usage", () => {
  let tmpHome: string;

  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/tool-usage/route");
  }

  async function get(url = "http://localhost/api/claude/tool-usage") {
    const { GET } = await loadRoute();
    const res = await GET(new Request(url));
    return res.json();
  }

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tool-usage-"));
    overrides.homedir = () => tmpHome;
  });

  afterEach(() => {
    delete overrides.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns an empty shape when the projects dir does not exist", async () => {
    const data = await get();
    expect(data).toMatchObject({ total: 0, mcp: [], cli: [], recent: [] });
  });

  it("buckets tool_use events into mcp vs cli and totals them", async () => {
    const now = new Date().toISOString();
    writeFixture(tmpHome, "proj1", "session1.jsonl", [
      { timestamp: now, message: { content: [{ type: "tool_use", name: "mcp__stickies__post" }] } },
      { timestamp: now, message: { content: [{ type: "tool_use", name: "mcp__stickies__post" }] } },
      { timestamp: now, message: { content: [{ type: "tool_use", name: "mcp__stickies__list" }] } },
      { timestamp: now, message: { content: [{ type: "tool_use", name: "Bash" }] } },
      { timestamp: now, message: { content: [{ type: "tool_use", name: "Bash" }] } },
      { timestamp: now, message: { content: [{ type: "tool_use", name: "Read" }] } },
    ]);

    const data = await get();
    expect(data.total).toBe(6);

    const mcpPost = data.mcp.find((m: { name: string }) => m.name === "mcp__stickies__post");
    expect(mcpPost).toMatchObject({ count: 2, server: "stickies", tool: "post" });

    const bash = data.cli.find((c: { name: string }) => c.name === "Bash");
    expect(bash).toMatchObject({ count: 2 });

    // mcp/cli must not cross-contaminate
    expect(data.cli.some((c: { name: string }) => c.name.startsWith("mcp__"))).toBe(false);
    expect(data.mcp.every((m: { name: string }) => m.name.startsWith("mcp__"))).toBe(true);
  });

  it("clamps the hours query param to the 1-720 range", async () => {
    const high = await get("http://localhost/api/claude/tool-usage?hours=99999");
    expect(high.hours).toBe(720);

    const low = await get("http://localhost/api/claude/tool-usage?hours=0");
    expect(low.hours).toBe(1);
  });

  it("excludes tool_use events older than the hours window", async () => {
    const stale = new Date(Date.now() - 48 * 3600_000).toISOString();
    writeFixture(tmpHome, "proj1", "old.jsonl", [
      { timestamp: stale, message: { content: [{ type: "tool_use", name: "Bash" }] } },
    ]);
    // File mtime is "now" (just written), but the event timestamp inside is
    // 48h old, outside the default 24h window - so it must be excluded from
    // the counted total even though the file itself isn't stale.
    const data = await get("http://localhost/api/claude/tool-usage?hours=24");
    expect(data.total).toBe(0);
  });
});

describe("GET /api/claude/token-stats", () => {
  let tmpHome: string;

  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/token-stats/route");
  }

  async function get() {
    const { GET } = await loadRoute();
    const res = await GET();
    return res.json();
  }

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "token-stats-"));
    overrides.homedir = () => tmpHome;
  });

  afterEach(() => {
    delete overrides.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns the empty-dir shape when ~/.claude/projects does not exist", async () => {
    const data = await get();
    expect(data).toEqual({
      sessions: [],
      byModel: [],
      byProject: [],
      totals: null,
      error: "No .claude/projects directory found",
    });
  });

  it("aggregates per-session token usage into totals, byModel, and byProject", async () => {
    writeFixture(tmpHome, "-Users-tester-Sites-demoapp", "session1.jsonl", [
      {
        type: "assistant",
        message: {
          model: "claude-sonnet-4-5",
          usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 },
        },
      },
    ]);

    const data = await get();
    expect(data.totals).toMatchObject({
      input_tokens: 100,
      output_tokens: 50,
      cache_read_tokens: 10,
      cache_creation_tokens: 5,
      total_tokens: 165,
      session_count: 1,
    });
    expect(data.byModel).toHaveLength(1);
    expect(data.byModel[0]).toMatchObject({ model: "claude-sonnet-4-5", total: 150 });
    expect(data.byProject).toHaveLength(1);
    expect(data.byProject[0]).toMatchObject({ project: "demoapp", total: 150 });
  });
});
