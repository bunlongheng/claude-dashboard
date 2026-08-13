import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// os is a Node ESM built-in - its namespace export isn't configurable, so
// vi.spyOn can't patch it directly. Route through a mutable override hook
// instead, defaulting to the real implementation (same pattern as
// claude-skills.test.ts).
const overrides: { homedir?: typeof os.homedir } = {};

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    ...actual,
    homedir: (...args: Parameters<typeof actual.homedir>) =>
      overrides.homedir ? overrides.homedir(...args) : actual.homedir(...args),
  };
});

type UsageRow = { name: string; count: number; pct: number; lastUsed: number };
interface SkillUsageData {
  hours: number;
  totalSkills: number;
  totalSubagents: number;
  skills: UsageRow[];
  subagents: UsageRow[];
}

// PROJECTS_DIR is computed once at module load from os.homedir(), so each
// test needs a fresh module instance to pick up its own tmpHome override.
async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/claude/skill-usage/route");
}

function writeFixture(tmpHome: string, project: string, file: string, lines: unknown[]) {
  const dir = path.join(tmpHome, ".claude", "projects", project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

async function get(url = "http://localhost/api/claude/skill-usage"): Promise<SkillUsageData> {
  const { GET } = await loadRoute();
  const res = await GET(new Request(url));
  return res.json();
}

describe("GET /api/claude/skill-usage", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "skill-usage-"));
    overrides.homedir = () => tmpHome;
  });

  afterEach(() => {
    delete overrides.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns empty totals when the projects dir does not exist", async () => {
    const data = await get();
    expect(data.totalSkills).toBe(0);
    expect(data.skills).toEqual([]);
  });

  it("counts a typed /repo-audit command-name as a skill and excludes the builtin /clear", async () => {
    const now = new Date().toISOString();
    writeFixture(tmpHome, "proj1", "session1.jsonl", [
      { timestamp: now, message: { content: "ran <command-name>/repo-audit</command-name> just now" } },
      { timestamp: now, message: { content: "then <command-name>/clear</command-name>" } },
    ]);

    const data = await get();
    const names = data.skills.map((s) => s.name);
    expect(names).toContain("repo-audit");
    expect(names).not.toContain("clear");
  });

  it("counts a Skill tool_use by input.skill and an Agent tool_use by subagent_type", async () => {
    const now = new Date().toISOString();
    writeFixture(tmpHome, "proj1", "session1.jsonl", [
      { timestamp: now, message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "debug" } }] } },
      {
        timestamp: now,
        message: { content: [{ type: "tool_use", name: "Agent", input: { subagent_type: "general-purpose" } }] },
      },
    ]);

    const data = await get();
    expect(data.skills.map((s) => s.name)).toContain("debug");
    expect(data.subagents.map((s) => s.name)).toContain("general-purpose");
  });

  it("clamps hours to the 1-720 range", async () => {
    const high = await get("http://localhost/api/claude/skill-usage?hours=99999");
    expect(high.hours).toBe(720);

    const low = await get("http://localhost/api/claude/skill-usage?hours=0");
    expect(low.hours).toBe(1);
  });

  it("ranks skills by count desc and computes pct as count/total*100", async () => {
    const now = new Date().toISOString();
    writeFixture(tmpHome, "proj1", "session1.jsonl", [
      { timestamp: now, message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "debug" } }] } },
      { timestamp: now, message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "debug" } }] } },
      { timestamp: now, message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "debug" } }] } },
      {
        timestamp: now,
        message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "brainstorm" } }] },
      },
    ]);

    const data = await get();
    expect(data.totalSkills).toBe(4);
    expect(data.skills[0]).toMatchObject({ name: "debug", count: 3 });
    expect(data.skills[0].pct).toBeCloseTo(75);
    expect(data.skills[1]).toMatchObject({ name: "brainstorm", count: 1 });
    expect(data.skills[1].pct).toBeCloseTo(25);
  });
});
