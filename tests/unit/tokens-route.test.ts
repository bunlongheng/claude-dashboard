import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const overrides: { homedir?: typeof os.homedir } = {};

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    ...actual,
    homedir: (...args: Parameters<typeof actual.homedir>) =>
      overrides.homedir ? overrides.homedir(...args) : actual.homedir(...args),
  };
});

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/claude/tokens/route");
}

function write(tmpHome: string, rel: string, lines: unknown[]) {
  const fp = path.join(tmpHome, ".claude", "projects", rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

// Fixed "now": 2026-10-05 15:00 local, so "today" starts at local midnight.
const NOW = new Date(2026, 9, 5, 15, 0, 0).getTime();
const H = 3600_000;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const assistant = (id: string, model: string, usage: Record<string, unknown>, offsetMs: number, extra: Record<string, unknown> = {}) => ({
  type: "assistant", timestamp: at(offsetMs), sessionId: "s1", cwd: "/Users/x/Sites/flows", gitBranch: "main", ...extra,
  message: { id, role: "assistant", model, usage, content: [{ type: "text", text: "x" }] },
});
const usage = { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 5 };

describe("GET /api/claude/tokens", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tokens-"));
    overrides.homedir = () => tmpHome;
  });

  afterEach(() => {
    delete overrides.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("dedupes repeated message ids, counts subagents, and attributes the first prompt", async () => {
    write(tmpHome, "-Users-x-Sites-flows/s1.jsonl", [
      { type: "user", timestamp: at(-3 * H), sessionId: "s1", message: { role: "user", content: "<command-name>/create-flow</command-name><command-args>login</command-args>" } },
      assistant("m1", "claude-opus-5", usage, -2.9 * H),
      assistant("m1", "claude-opus-5", usage, -2.9 * H), // same message written twice
      assistant("m2", "claude-opus-5", usage, -2.8 * H),
    ]);
    write(tmpHome, "-Users-x-Sites-flows/s1/subagents/agent-a1.jsonl", [
      assistant("a1", "claude-sonnet-5", { input_tokens: 1, output_tokens: 50 }, -2.7 * H, { agentId: "a1", isSidechain: true }),
    ]);
    const { computeTokens } = await loadRoute();
    const d = await computeTokens("today", NOW);
    expect(d.totals).toMatchObject({ turns: 3, input: 21, output: 250, cacheRead: 2000, cacheCreate: 10, sessions: 1, agents: 1, mainOutput: 200, agentOutput: 50 });
    expect(d.who.map((w) => [w.model, w.role, w.output])).toEqual([["claude-opus-5", "main", 200], ["claude-sonnet-5", "agent", 50]]);
    expect(d.who[0].share).toBeCloseTo(0.8);
    expect(d.sessions[0]).toMatchObject({ sessionId: "s1", project: "flows", title: "/create-flow login", agents: 1, agentOutput: 50, models: ["claude-opus-5", "claude-sonnet-5"], active: false });
    expect(d.projects).toEqual([expect.objectContaining({ project: "flows", sessions: 1, output: 250 })]);
    // 12:06, 12:12 and 12:18 local -> slots 145, 146, 147; the duplicate m1 counts once.
    expect(d.minutes).toHaveLength(288);
    expect([d.minutes[145], d.minutes[146], d.minutes[147]]).toEqual([1, 1, 1]);
    expect(d.minutes.reduce((x, y) => x + y, 0)).toBe(3);
  });

  it("today starts at local midnight, 7d keeps yesterday, and live sessions are flagged", async () => {
    write(tmpHome, "p/s1.jsonl", [
      assistant("y1", "claude-opus-5", usage, -20 * 3600_000), // 7 PM yesterday
      assistant("t1", "claude-opus-5", usage, -2 * 60_000),    // 2 min ago -> live
    ]);
    const { computeTokens } = await loadRoute();
    const today = await computeTokens("today", NOW);
    expect(today.from).toBe(new Date(2026, 9, 5).getTime());
    expect(today.totals.turns).toBe(1);
    expect(today.sessions[0].active).toBe(true);
    const week = await computeTokens("7d", NOW);
    expect(week.totals.turns).toBe(2);
    expect(week.daily.map((x) => [x.day, x.turns])).toEqual([["2026-10-04", 1], ["2026-10-05", 1]]);
    expect(week.daily[0].cost).toBeGreaterThan(0);
    // 2026-10-04 is a Sunday (week of Mon 09-28); 10-05 starts a new week
    expect(week.weekly.map((x) => [x.period, x.turns, x.sessions])).toEqual([["2026-09-28", 1, 1], ["2026-10-05", 1, 1]]);
    expect(week.monthly.map((x) => [x.period, x.turns, x.output])).toEqual([["2026-10", 2, 200]]);
  });

  it("dedupes one message across files, reads deep subagent folders, and counts 1h cache writes", async () => {
    const launch = { input_tokens: 10, output_tokens: 900, cache_read_input_tokens: 1000, cache_creation_input_tokens: 5 };
    write(tmpHome, "p/s1.jsonl", [
      assistant("m1", "claude-opus-5", { ...launch, output_tokens: 2 }, -2 * H), // streaming placeholder
      assistant("m1", "claude-opus-5", launch, -2 * H),                          // final copy
      assistant("m2", "claude-opus-5", { input_tokens: 1, output_tokens: 10, cache_creation_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 7990 } }, -1.9 * H),
    ]);
    // a subagent transcript opens with a copy of the parent's launch message (placeholder usage)
    write(tmpHome, "p/s1/subagents/agent-a1.jsonl", [
      assistant("m1", "claude-opus-5", { ...launch, output_tokens: 1 }, -1.8 * H, { agentId: "a1", isSidechain: true, parentUuid: null }),
      assistant("a1", "claude-sonnet-5", { input_tokens: 1, output_tokens: 50 }, -1.7 * H, { agentId: "a1", isSidechain: true }),
    ]);
    // workflow agents live 2 levels deeper
    write(tmpHome, "p/s1/subagents/workflows/wf_1/agent-w1.jsonl", [
      assistant("w1", "claude-haiku-4-5-20251001", { input_tokens: 1, output_tokens: 20 }, -1.6 * H, { agentId: "w1", isSidechain: true }),
    ]);
    // a forked session carries the original history, same message ids
    write(tmpHome, "p/s2.jsonl", [
      assistant("m1", "claude-opus-5", launch, -2 * H, { sessionId: "s2" }),
      assistant("f1", "claude-opus-5", { input_tokens: 1, output_tokens: 30 }, -1 * H, { sessionId: "s2" }),
    ]);
    const { computeTokens } = await loadRoute();
    const d = await computeTokens("today", NOW);
    expect(d.totals).toMatchObject({ turns: 5, output: 1010, cacheCreate: 7995, agents: 2, mainOutput: 940, agentOutput: 70 });
    expect(d.sessions.map((s) => [s.sessionId, s.output, s.agents]).sort()).toEqual([["s1", 980, 2], ["s2", 30, 0]]);
    expect(d.who.map((w) => [w.model, w.output])).toEqual([["claude-opus-5", 940], ["claude-sonnet-5", 50], ["claude-haiku-4-5-20251001", 20]]);
  });

  it("falls back to today on a bad since param", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/claude/tokens?since=nope"), {});
    const d = await res.json();
    expect(d.since).toBe("today");
    expect(d.totals.sessions).toBe(0);
  });
});
