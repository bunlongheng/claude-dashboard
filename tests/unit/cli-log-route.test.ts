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

import { CLI_TOOLS } from "@/lib/cli-tools";

type CliLogData = import("@/app/api/claude/cli-log/route").CliLogData;

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/claude/cli-log/route");
}

function write(tmpHome: string, rel: string, lines: unknown[]) {
  const fp = path.join(tmpHome, ".claude", "projects", rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

// Fixed "now": Monday 2026-10-05 15:00 local.
const NOW = new Date(2026, 9, 5, 15, 0, 0).getTime();
const H = 3600_000;
const iso = (offsetMs = 0) => new Date(NOW + offsetMs).toISOString();
const toolUse = (id: string, name: string, input: unknown, offsetMs = 0, extra: Record<string, unknown> = {}) => ({
  type: "assistant", timestamp: iso(offsetMs), cwd: "/Users/x/Sites/flows", sessionId: "s1", gitBranch: "main", ...extra,
  message: { role: "assistant", model: "claude-opus-5", usage: { output_tokens: 100 }, content: [{ type: "tool_use", id, name, input }] },
});
const toolResult = (id: string, text: string, offsetMs = 0, isError = false) => ({
  type: "user", timestamp: iso(offsetMs), sessionId: "s1",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content: [{ type: "text", text }] }] },
});

describe("GET /api/claude/cli-log", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "cli-log-"));
    fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
    overrides.homedir = () => tmpHome;
  });

  afterEach(() => {
    delete overrides.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("lists every built-in tool as idle when nothing was called and ignores MCP calls", async () => {
    write(tmpHome, "p/s1.jsonl", [toolUse("m1", "mcp__flows__create_flow", { q: 1 }, -1 * H)]);
    const { computeCliLog } = await loadRoute();
    const d = await computeCliLog("today", NOW);
    expect(d.kind).toBe("cli");
    expect(d.totals.calls).toBe(0);
    expect(d.servers.length).toBe(CLI_TOOLS.length);
    expect(d.servers.every((s) => s.verdict === "idle" && s.configured)).toBe(true);
  });

  it("groups by tool and names the target: command binary, file type, agent type, skill", async () => {
    write(tmpHome, "-Users-x-Sites-flows/s1.jsonl", [
      { type: "user", timestamp: iso(-3 * H), message: { role: "user", content: "fix the build" } },
      toolUse("b1", "Bash", { command: "cd /x && source ~/.nvm/nvm.sh && npm run build" }, -2 * H),
      toolResult("b1", "x".repeat(400), -2 * H + 500),
      toolUse("b2", "Bash", { command: "git commit -m x" }, -2 * H),
      toolUse("b3", "Bash", { command: "FOO=1 /usr/bin/curl -s http://x" }, -2 * H),
      toolUse("r1", "Read", { file_path: "/x/app/page.tsx" }, -2 * H),
      toolUse("a1", "Agent", { subagent_type: "arrow", prompt: "run tests" }, -2 * H, { attributionSkill: "e2e" }),
      toolUse("k1", "Skill", { skill: "html" }, -2 * H),
      toolUse("f1", "WebFetch", { url: "https://docs.example.com/a/b" }, -2 * H),
      toolUse("n1", "BrandNewTool", { x: 1 }, -2 * H),
    ]);
    write(tmpHome, "-Users-x-Sites-flows/s1/subagents/agent-a1.jsonl", [
      toolUse("s1", "Grep", { pattern: "TODO" }, -1 * H, { agentId: "a1", isSidechain: true }),
    ]);
    const { computeCliLog } = await loadRoute();
    const d = await computeCliLog("today", NOW);
    const by = Object.fromEntries(d.servers.map((s) => [s.server, s]));
    expect(d.totals.calls).toBe(9);
    expect(by.Bash.tools.map((t) => t.tool).sort()).toEqual(["curl", "git commit", "npm run"]);
    expect(by.Bash.tools.find((t) => t.tool === "npm run")).toMatchObject({ calls: 1, tokens: 100 });
    expect(by.Read.tools[0].tool).toBe(".tsx");
    expect(by.Agent.tools[0].tool).toBe("arrow");
    expect(by.Agent.skills).toEqual({ e2e: 1 });
    expect(by.Skill.tools[0].tool).toBe("/html");
    expect(by.WebFetch.tools[0].tool).toBe("docs.example.com");
    expect(by.Grep.calls).toBe(1); // subagent transcript is scanned too
    expect(by.BrandNewTool).toMatchObject({ configured: false, verdict: "gone", calls: 1 });
    expect(d.recent.find((c) => c.server === "Bash")?.prompt).toBe("fix the build");
    expect(d.servers[0].server).toBe("Bash");
  });

  it("names the real command behind cd, assignments, wrappers, quotes and loops", async () => {
    const { firstCommand } = await import("@/lib/tool-log");
    expect(firstCommand("cd /x && source ~/.nvm/nvm.sh && npm run build")).toBe("npm run");
    expect(firstCommand("SD=/tmp/a/scratchpad; cp $SD/x y")).toBe("cp");
    expect(firstCommand(". ~/.nvm/nvm.sh && sudo launchctl kickstart -k x")).toBe("launchctl kickstart");
    expect(firstCommand("sed -i '' 's|a|b|' file | head")).toBe("sed");
    expect(firstCommand("grep -q '^KEY=' .env || echo missing")).toBe("grep");
    expect(firstCommand("for w in a b; do curl -s $w; done")).toBe("curl");
    expect(firstCommand("(npm test 2>&1 | tail -3)")).toBe("npm test");
    expect(firstCommand("# just a comment\nls -la")).toBe("ls");
    expect(firstCommand("FOO=1 /usr/bin/python3 - <<'EOF'\nprint(1)\nEOF")).toBe("python3");
    expect(firstCommand("cd ~/x && L=$(shasum -a 256 icon.png | cut -c1-16); echo $L")).toBe("shasum");
    expect(firstCommand("PID=\"$(lsof -nP -iTCP:9875 -t | head -1)\"; kill $PID")).toBe("lsof");
    expect(firstCommand("case \"$d\" in *keep*) ;; *) rm -rf \"$d\" ;; esac")).toBe("rm");
    expect(firstCommand("command -v gh >/dev/null && gh auth status")).toBe("gh");
    expect(firstCommand("sudo -n true 2>/dev/null && echo ok")).toBe("echo");
    expect(firstCommand("UA=\"Mozilla/5.0 (Macintosh; x)\"; curl -A \"$UA\" http://x")).toBe("curl");
    expect(firstCommand("probe=\"p-$(date +%s)\"\ncurl $probe")).toBe("curl");
    expect(firstCommand("{ [ -n \"$X\" ]; } && echo ok")).toBe("echo");
    expect(firstCommand("cd x && \\\ngit add a b")).toBe("git add");
    expect(firstCommand("set -a; . ./.env; set +a; : > out; node -e 1")).toBe("node");
    expect(firstCommand("cd x && UA=\"Mozilla/5.0 (Macintosh; a) b\" && curl -A \"$UA\" u")).toBe("curl");
    expect(firstCommand("files=$( (git diff --name-only; git ls-files) | grep x)")).toBe("git diff");
    expect(firstCommand("cd /only")).toBe("cd");
    expect(firstCommand("")).toBe("-");
  });

  it("falls back to today on a bad win param", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/claude/cli-log?win=nope"));
    const d: CliLogData = await res.json();
    expect(d.win).toBe("today");
    expect(d.buckets.unit).toBe("hour");
  });
});
