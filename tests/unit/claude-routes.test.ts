import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Behavioral tests for 7 more app/api/claude/* routes, following the fixture
// pattern from tests/unit/skill-usage-route.test.ts and tests/unit/data-routes.test.ts:
// override os.homedir() so each route's module-level CLAUDE_DIR/PROJECTS_DIR
// const points at a tmp fixture, and vi.resetModules() per test for isolation
// from module-level caches (fileCache, responseCache, respCache, scanCache).
//
// app/api/claude/sessions/route.ts, app/api/claude/claude-sessions/route.ts,
// app/api/claude/observability/route.ts, app/api/claude/search/route.ts,
// app/api/claude/brain/route.ts, app/api/claude/claude-md*/route.ts,
// app/api/claude/mcp-activity/route.ts, app/api/claude/project-icon/route.ts,
// and app/api/claude/sync-skill/route.ts were left for a later pass - not
// attempted here to keep this file scoped to the 7 routes assigned.

const overrides: { homedir?: typeof os.homedir } = {};

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    ...actual,
    homedir: (...args: Parameters<typeof actual.homedir>) =>
      overrides.homedir ? overrides.homedir(...args) : actual.homedir(...args),
  };
});

// context/route.ts depends on getLiveSessionIds(), which shells out to lsof
// (excluded from unit coverage in vitest.config.ts). Mock it so "live" session
// membership is fully test-controlled instead of depending on real processes.
const liveOverrides: { ids?: Set<string> } = {};
vi.mock("@/lib/live-sessions", () => ({
  getLiveSessionIds: () => liveOverrides.ids ?? new Set<string>(),
}));

// turns-by-hour/route.ts depends on isRealRepo(), which walks the real filesystem
// to confirm a project folder maps to an actual directory - not something a tmp
// fixture folder name can satisfy. Force it true; keep every other export real.
vi.mock("@/lib/project-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/project-utils")>();
  return { ...actual, isRealRepo: () => true };
});

const REAL_USER = os.userInfo().username;

function writeFixture(tmpHome: string, project: string, file: string, lines: unknown[]) {
  const dir = path.join(tmpHome, ".claude", "projects", project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-routes-"));
  overrides.homedir = () => tmpHome;
});

afterEach(() => {
  delete overrides.homedir;
  delete liveOverrides.ids;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

// ─── /api/claude/context ─────────────────────────────────────────────────────

describe("GET /api/claude/context", () => {
  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/context/route");
  }
  async function get() {
    const { GET } = await loadRoute();
    const res = await GET();
    return res.json();
  }

  it("returns an empty sessions list when the projects dir does not exist", async () => {
    const data = await get();
    expect(data).toEqual({ sessions: [] });
  });

  it("excludes a session with no live claude process attached", async () => {
    const project = `-Users-${REAL_USER}-Sites-demoapp`;
    writeFixture(tmpHome, project, "sess-not-live.jsonl", [
      { type: "assistant", timestamp: "2026-01-01T00:00:00.000Z", message: { model: "claude-sonnet-4-5", usage: { input_tokens: 100, output_tokens: 20 } } },
    ]);
    liveOverrides.ids = new Set(); // nothing live
    const data = await get();
    expect(data.sessions).toEqual([]);
  });

  it("includes a live session with computed context usage, model, and project name", async () => {
    const project = `-Users-${REAL_USER}-Sites-demoapp`;
    writeFixture(tmpHome, project, "sess-live.jsonl", [
      { type: "custom-title", customTitle: "My Session" },
      {
        type: "assistant",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { model: "claude-sonnet-4-5", usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 } },
      },
    ]);
    liveOverrides.ids = new Set(["sess-live"]);

    const data = await get();
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0]).toMatchObject({
      sessionId: "sess-live",
      project: "demoapp",
      model: "claude-sonnet-4-5",
      contextUsed: 160, // cache_read(50) + input(100) + cache_creation(10)
      contextMax: 1_000_000, // sonnet
      inputTokens: 100,
      turns: 1,
      customTitle: "My Session",
    });
  });

  it("sorts multiple live sessions by contextUsed descending", async () => {
    const project = `-Users-${REAL_USER}-Sites-demoapp`;
    writeFixture(tmpHome, project, "sess-small.jsonl", [
      { type: "assistant", timestamp: "2026-01-01T00:00:00.000Z", message: { model: "claude-haiku-4-5", usage: { input_tokens: 10, output_tokens: 5 } } },
    ]);
    writeFixture(tmpHome, project, "sess-big.jsonl", [
      { type: "assistant", timestamp: "2026-01-01T00:00:00.000Z", message: { model: "claude-opus-4-5", usage: { input_tokens: 5000, output_tokens: 5 } } },
    ]);
    liveOverrides.ids = new Set(["sess-small", "sess-big"]);

    const data = await get();
    expect(data.sessions.map((s: { sessionId: string }) => s.sessionId)).toEqual(["sess-big", "sess-small"]);
  });
});

// ─── /api/claude/token-stats/daily ───────────────────────────────────────────

describe("GET /api/claude/token-stats/daily", () => {
  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/token-stats/daily/route");
  }
  async function get() {
    const { GET } = await loadRoute();
    const res = await GET();
    return res.json();
  }

  it("returns the empty shape when the projects dir does not exist", async () => {
    const data = await get();
    expect(data).toEqual({ daily: [], byModel: [], tools: [], totalTurns: 0, totalSessions: 0, byDayHour: {} });
  });

  it("aggregates today's usage into daily, byModel, and tools buckets", async () => {
    const project = `-Users-${REAL_USER}-Sites-demoapp`;
    const now = new Date().toISOString();
    // parseFile() always shifts off the first line (it assumes the tail-read
    // may have started mid-line), even when the whole small file was read -
    // so a leading throwaway line is required for the two real entries below
    // to both be counted.
    writeFixture(tmpHome, project, "session1.jsonl", [
      { type: "other", note: "dropped by the parser's always-shift-first-line rule" },
      { type: "assistant", timestamp: now, message: { model: "claude-sonnet-4-5", content: [{ type: "tool_use", name: "Bash" }], usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 } } },
      { type: "assistant", timestamp: now, message: { model: "claude-sonnet-4-5", usage: { input_tokens: 10, output_tokens: 5 } } },
    ]);

    const data = await get();
    expect(data.totalTurns).toBe(2);
    expect(data.totalSessions).toBe(1);

    const today = data.daily[0];
    expect(today.turns).toBe(2);
    expect(today.input).toBe(110);
    expect(today.output).toBe(55);
    expect(today.sessions).toBe(1);

    expect(data.byModel[0]).toMatchObject({ model: "claude-sonnet-4-5", turns: 2 });
    expect(data.tools).toContainEqual({ tool: "Bash", calls: 1 });

    const dayKey = Object.keys(data.byDayHour)[0];
    const hourArr = data.byDayHour[dayKey];
    expect(hourArr.reduce((a: number, b: number) => a + b, 0)).toBe(2);
  });
});

// ─── /api/claude/turns-by-hour ───────────────────────────────────────────────

describe("GET /api/claude/turns-by-hour", () => {
  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/turns-by-hour/route");
  }
  async function get(url: string) {
    const { GET } = await loadRoute();
    const res = await GET(new Request(url));
    return { status: res.status, body: await res.json() };
  }

  function localYMD(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  it("returns 400 for a missing/invalid date or hour", async () => {
    const { status, body } = await get("http://localhost/api/claude/turns-by-hour");
    expect(status).toBe(400);
    expect(body.error).toMatch(/invalid/);
  });

  it("returns turns for real user prompts and assistant replies within the exact date+hour bucket", async () => {
    const now = new Date();
    const date = localYMD(now);
    const hour = now.getHours();
    // Build a timestamp inside the target local hour, at minute 0.
    const ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0).toISOString();

    const project = `-Users-${REAL_USER}-Sites-demoapp`;
    writeFixture(tmpHome, project, "session1.jsonl", [
      { type: "user", timestamp: ts, message: { role: "user", content: "hello there" } },
      { type: "assistant", timestamp: ts, message: { role: "assistant", model: "claude-sonnet-4-5", content: "hi!", usage: { input_tokens: 5, output_tokens: 3 } } },
    ]);

    const { status, body } = await get(`http://localhost/api/claude/turns-by-hour?date=${date}&hour=${hour}`);
    expect(status).toBe(200);
    expect(body.sessionPrompts["session1"]).toBe(1);
    expect(body.sessionTurns["session1"]).toBe(1);
    expect(body.totalSessions).toBe(1);
    expect(body.sessionEntries["session1"][0].preview).toContain("hello there");
  });
});

// ─── /api/claude/agents ───────────────────────────────────────────────────────

describe("GET /api/claude/agents", () => {
  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/agents/route");
  }
  async function get(url = "http://localhost/api/claude/agents") {
    const { GET } = await loadRoute();
    const res = await GET(new Request(url));
    return res.json();
  }

  it("returns an empty list when the projects dir does not exist", async () => {
    const data = await get();
    expect(data).toEqual({ agents: [], total: 0, mode: "live" });
  });

  it("pairs an Agent tool_use with its tool_result into a completed run record", async () => {
    const project = `-Users-${REAL_USER}-Sites-demoapp`;
    const started = new Date().toISOString();
    const completed = new Date(Date.now() + 5000).toISOString();
    writeFixture(tmpHome, project, "session1.jsonl", [
      {
        type: "assistant",
        timestamp: started,
        uuid: "assistant-1",
        message: { content: [{ type: "tool_use", id: "call-1", name: "Agent", input: { subagent_type: "general-purpose", description: "do the thing", prompt: "go do it" } }] },
      },
      {
        type: "user",
        timestamp: completed,
        message: { content: [{ type: "tool_result", tool_use_id: "call-1", is_error: false, content: [{ text: "done!" }] }] },
      },
    ]);

    const data = await get();
    expect(data.total).toBe(1);
    expect(data.agents[0]).toMatchObject({
      sessionId: "session1",
      project: "demoapp",
      subagentType: "general-purpose",
      description: "do the thing",
      status: "done",
      result: "done!",
    });
    expect(data.agents[0].durationMs).toBeGreaterThan(0);
  });

  it("leaves an agent marked running when no tool_result has arrived yet", async () => {
    const project = `-Users-${REAL_USER}-Sites-demoapp`;
    writeFixture(tmpHome, project, "session2.jsonl", [
      {
        type: "assistant",
        timestamp: new Date().toISOString(),
        message: { content: [{ type: "tool_use", id: "call-2", name: "Agent", input: { subagent_type: "Explore", description: "still going" } }] },
      },
    ]);

    const data = await get();
    expect(data.agents[0]).toMatchObject({ status: "running", subagentType: "Explore", completedAt: null });
  });
});

// ─── /api/claude/machines ─────────────────────────────────────────────────────

describe("GET /api/claude/machines", () => {
  const prevMachines = process.env.MACHINES;
  const prevMachinesDb = process.env.MACHINES_DB_PATH;

  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/machines/route");
  }
  async function get(url = "http://localhost/api/claude/machines") {
    const { GET } = await loadRoute();
    const res = await GET(new Request(url));
    return res.json();
  }

  afterEach(() => {
    if (prevMachines === undefined) delete process.env.MACHINES; else process.env.MACHINES = prevMachines;
    if (prevMachinesDb === undefined) delete process.env.MACHINES_DB_PATH; else process.env.MACHINES_DB_PATH = prevMachinesDb;
  });

  it("returns only the local machine when MACHINES is unset", async () => {
    delete process.env.MACHINES;
    delete process.env.MACHINES_DB_PATH;
    const data = await get();
    expect(data.machines).toHaveLength(1);
    expect(data.machines[0]).toMatchObject({ ip: "127.0.0.1", isLocal: true, online: true });
  });

});

// ─── /api/claude/lan ──────────────────────────────────────────────────────────

describe("GET /api/claude/lan", () => {
  it("returns hostname/ip/port/model/url shape", async () => {
    const { GET } = await import("@/app/api/claude/lan/route");
    const res = await GET();
    const data = await res.json();
    expect(typeof data.hostname).toBe("string");
    expect(typeof data.ip).toBe("string");
    expect(data.url).toBe(`http://${data.ip}:${data.port}`);
    expect(Array.isArray(data.allIps)).toBe(true);
  });
});

// ─── /api/claude/skills (config scan: plugins/skills/commands/mcp/hooks/claudeMd) ──

describe("GET /api/claude/skills", () => {
  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/skills/route");
  }
  async function get(url = "http://localhost/api/claude/skills") {
    const { GET } = await loadRoute();
    const res = await GET(new Request(url));
    return res.json();
  }

  function writeSkill(base: string, plugin: string, skill: string, body: string) {
    const dir = path.join(base, plugin, "skills", skill);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), body);
  }

  it("returns empty scan results when ~/.claude has nothing configured", async () => {
    const data = await get();
    expect(data.skills).toEqual([]);
    expect(data.plugins).toEqual([]);
    expect(data.summary).toMatchObject({ plugins: 0, skills: 0, commands: 0 });
  });

  it("finds a standalone skill under ~/.claude/skills/ with its description", async () => {
    const standaloneDir = path.join(tmpHome, ".claude", "skills", "my-skill");
    fs.mkdirSync(standaloneDir, { recursive: true });
    fs.writeFileSync(
      path.join(standaloneDir, "SKILL.md"),
      "---\nname: my-skill\ndescription: does a thing\n---\n\nDoes a thing well.\n"
    );

    const data = await get();
    const found = data.skills.find((s: { name: string }) => s.name === "my-skill");
    expect(found).toMatchObject({ plugin: "standalone", source: "external" });
    expect(found.description).toContain("Does a thing well.");
  });

  it("finds a plugin-scoped skill under the marketplace directory, tagged builtin", async () => {
    const marketplaceDir = path.join(tmpHome, ".claude", "plugins", "marketplaces", "claude-plugins-official", "plugins");
    writeSkill(marketplaceDir, "myplugin", "myskill", "---\nname: myskill\n---\n\nBuiltin skill body.\n");

    const data = await get();
    const found = data.skills.find((s: { name: string }) => s.name === "myskill");
    expect(found).toMatchObject({ plugin: "myplugin", source: "builtin" });
  });

  it("finds a standalone command and an mcp server from .mcp.json", async () => {
    const cmdDir = path.join(tmpHome, ".claude", "commands");
    fs.mkdirSync(cmdDir, { recursive: true });
    fs.writeFileSync(path.join(cmdDir, "mycmd.md"), "# does a thing\nbody\n");

    fs.writeFileSync(
      path.join(tmpHome, ".claude", ".mcp.json"),
      JSON.stringify({ mcpServers: { stickies: { command: "npx", args: ["stickies-server.js"] } } })
    );

    const data = await get();
    expect(data.commands.map((c: { name: string }) => c.name)).toContain("/mycmd");
    const mcp = data.mcp.find((m: { name: string }) => m.name === "stickies");
    expect(mcp).toMatchObject({ type: "command", source: "user" });
  });

  it("includes the global CLAUDE.md and reflects it in summary counts", async () => {
    fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, ".claude", "CLAUDE.md"), "# Global rules\nBe concise.\n");

    const data = await get();
    const globalMd = data.claudeMd.find((f: { scope: string }) => f.scope === "global");
    expect(globalMd).toMatchObject({ name: "Global CLAUDE.md" });
    expect(data.summary.claudeMd).toBe(data.claudeMd.length);
  });
});
