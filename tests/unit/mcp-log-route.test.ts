import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Same homedir override hook as skill-usage-route.test.ts: os is an ESM
// built-in, so vi.spyOn cannot patch it directly.
const overrides: { homedir?: typeof os.homedir } = {};

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    ...actual,
    homedir: (...args: Parameters<typeof actual.homedir>) =>
      overrides.homedir ? overrides.homedir(...args) : actual.homedir(...args),
  };
});

type McpLogData = import("@/app/api/claude/mcp-log/route").McpLogData;
type Win = import("@/app/api/claude/mcp-log/route").Win;

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/claude/mcp-log/route");
}

function writeFixture(tmpHome: string, project: string, file: string, lines: unknown[]) {
  const dir = path.join(tmpHome, ".claude", "projects", project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

function writeConfig(tmpHome: string, servers: string[]) {
  const mcpServers = Object.fromEntries(servers.map((s) => [s, { command: "x" }]));
  fs.writeFileSync(path.join(tmpHome, ".claude.json"), JSON.stringify({ mcpServers }));
}

// Fixed "now": Monday 2026-10-05 15:00 local.
const NOW = new Date(2026, 9, 5, 15, 0, 0).getTime();
const H = 3600_000;

async function compute(win: Win = "today"): Promise<McpLogData> {
  const { computeMcpLog } = await loadRoute();
  return computeMcpLog(win, NOW);
}

const iso = (offsetMs = 0) => new Date(NOW + offsetMs).toISOString();
const toolUse = (id: string, name: string, offsetMs = 0, extra: Record<string, unknown> = {}) => ({
  type: "assistant", timestamp: iso(offsetMs), cwd: "/Users/x/Sites/flows", sessionId: "s1", gitBranch: "main", ...extra,
  message: { role: "assistant", model: "claude-opus-5", usage: { output_tokens: 100 }, content: [{ type: "tool_use", id, name, input: { q: 1 } }] },
});
const toolResult = (id: string, text: string, offsetMs = 0, isError = false) => ({
  type: "user", timestamp: iso(offsetMs), sessionId: "s1",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content: [{ type: "text", text }] }] },
});

describe("GET /api/claude/mcp-log", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-log-"));
    fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
    overrides.homedir = () => tmpHome;
  });

  afterEach(() => {
    delete overrides.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns empty totals and marks configured servers idle when there are no transcripts", async () => {
    writeConfig(tmpHome, ["flows"]);
    const data = await compute();
    expect(data.totals.calls).toBe(0);
    expect(data.servers).toHaveLength(1);
    expect(data.servers[0]).toMatchObject({ server: "flows", configured: true, verdict: "idle", calls: 0 });
  });

  it("pairs a tool_use with its tool_result and attributes the last human prompt", async () => {
    writeConfig(tmpHome, ["flows"]);
    writeFixture(tmpHome, "-Users-x-Sites-flows", "s1.jsonl", [
      { type: "user", timestamp: iso(-3000), message: { role: "user", content: "<system-reminder>noise</system-reminder>diagram the login flow" } },
      toolUse("t1", "mcp__flows__create_flow", -2000, { attributionSkill: "create-flow" }),
      toolResult("t1", "x".repeat(400), -1500),
    ]);
    const data = await compute();
    expect(data.totals.calls).toBe(1);
    const c = data.recent[0];
    expect(c).toMatchObject({ server: "flows", tool: "create_flow", project: "flows", model: "claude-opus-5", skill: "create-flow", prompt: "diagram the login flow", resultChars: 400, resultTokens: 100, isError: false, latencyMs: 500 });
    expect(c.cost).toBeGreaterThan(0);
    expect(data.servers[0].tools).toEqual([{ tool: "create_flow", calls: 1, errors: 0, tokens: 100, lastUsed: c.ts }]);
  });

  it("turns a typed slash command into the prompt", async () => {
    writeFixture(tmpHome, "p", "s1.jsonl", [
      { type: "user", timestamp: iso(-3000), message: { role: "user", content: "<command-name>/create-flow</command-name><command-args>url shortener</command-args>" } },
      toolUse("t1", "mcp__flows__create_flow", -2000),
    ]);
    const data = await compute();
    expect(data.recent[0].prompt).toBe("/create-flow url shortener");
  });

  it("verdicts: gone when unconfigured, flaky on a high error rate, connector for claude_ai_*", async () => {
    writeConfig(tmpHome, ["flaky"]);
    const lines: unknown[] = [toolUse("g1", "mcp__oldserver__ping", -1000), toolUse("c1", "mcp__claude_ai_Gmail__search", -1000)];
    for (let i = 0; i < 4; i++) {
      lines.push(toolUse(`f${i}`, "mcp__flaky__do", -1000));
      lines.push(toolResult(`f${i}`, "boom", -900, i < 2));
    }
    writeFixture(tmpHome, "p", "s1.jsonl", lines);
    const data = await compute();
    const by = Object.fromEntries(data.servers.map((s) => [s.server, s]));
    expect(by.oldserver).toMatchObject({ configured: false, verdict: "gone", calls: 1 });
    expect(by.flaky).toMatchObject({ verdict: "flaky", calls: 4, errors: 2 });
    expect(by.claude_ai_Gmail.verdict).toBe("connector");
    expect(data.totals.errors).toBe(2);
  });

  it("today starts at local midnight with hour buckets; 7d, 30d and 90d use day and month buckets", async () => {
    writeFixture(tmpHome, "p", "s1.jsonl", [
      toolUse("old", "mcp__flows__list_flows", -20 * H), // yesterday 7 PM
      toolUse("new", "mcp__flows__list_flows", -1 * H),  // today 2 PM
    ]);
    const today = await compute("today");
    expect(today.since).toBe(new Date(2026, 9, 5).getTime());
    expect(today.totals.calls).toBe(1);
    expect(today.buckets).toMatchObject({ unit: "hour", labels: expect.arrayContaining(["12a", "2p", "11p"]) });
    expect(today.servers[0].series[14]).toBe(1);

    const week = await compute("7d");
    expect(week.totals.calls).toBe(2);
    expect(week.buckets.unit).toBe("day");
    expect(week.buckets.labels).toEqual(["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"]);
    expect(week.servers[0].series).toEqual([0, 0, 0, 0, 0, 1, 1]);

    const month = await compute("30d");
    expect(month.buckets.labels).toHaveLength(30);
    expect(month.buckets.labels[29]).toBe("10/5");

    const quarter = await compute("90d");
    expect(quarter.buckets).toEqual({ unit: "month", labels: ["Jul", "Aug", "Sep", "Oct"] });
    expect(quarter.servers[0].series).toEqual([0, 0, 0, 2]);
  });

  it("falls back to today on a bad win param", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/claude/mcp-log?win=nope"));
    const data: McpLogData = await res.json();
    expect(data.win).toBe("today");
  });
});
