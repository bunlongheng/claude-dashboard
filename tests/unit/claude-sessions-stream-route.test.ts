import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NextRequest } from "next/server";

// Behavioral tests for app/api/claude/claude-sessions/[sessionId]/stream/route.ts,
// the SSE tail of a session .jsonl. The stream catches up on the existing file
// synchronously in start() and then emits "ready", so reading until that event
// yields the full parsed sequence without waiting on the 1 s poll loop. The
// request signal is aborted afterwards so the interval is cleared.

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
let projectDir: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "stream-route-"));
  overrides.homedir = () => tmpHome;
  projectDir = path.join(tmpHome, ".claude", "projects", "-Users-me-Sites-proj");
  fs.mkdirSync(projectDir, { recursive: true });
});

afterEach(() => {
  delete overrides.homedir;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/claude/claude-sessions/[sessionId]/stream/route");
}

async function open(sessionId: string) {
  const { GET } = await loadRoute();
  const ac = new AbortController();
  const req = new NextRequest(`http://localhost/api/claude/claude-sessions/${sessionId}/stream`, { signal: ac.signal });
  const res = await GET(req, { params: Promise.resolve({ sessionId }) });
  return { res, abort: () => ac.abort() };
}

// Read chunks until the "ready" event lands, then parse "event:/data:" pairs.
async function readUntilReady(res: Response): Promise<{ event: string; data: Record<string, unknown> }[]> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (!buf.includes("event: ready\n")) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
  }
  reader.releaseLock();
  return buf.split("\n\n").filter(Boolean).map((frame) => {
    const [ev, data] = frame.split("\n");
    return { event: ev.replace("event: ", ""), data: JSON.parse(data.replace("data: ", "")) };
  });
}

describe("GET /api/claude/claude-sessions/[sessionId]/stream", () => {
  it("returns 404 for an unknown session id", async () => {
    const { res } = await open("nope");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an id with path characters instead of scanning", async () => {
    const { res } = await open("../../etc");
    expect(res.status).toBe(404);
  });

  it("streams the parsed event sequence for the existing file then ready", async () => {
    const lines = [
      { type: "user", timestamp: "t1", todos: [{ content: "do x", status: "pending" }], message: { content: [{ type: "text", text: "hello" }] } },
      "this is not json",
      { type: "assistant", timestamp: "t2", message: { model: "claude-sonnet", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 }, content: [
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: "sure" },
        { type: "tool_use", name: "Bash", input: { command: "ls -la" } },
        { type: "tool_use", name: "Read", input: { file_path: "/a/b/c/d.ts" } },
        { type: "tool_use", name: "Custom", input: { k: 1 } },
      ] } },
      { type: "user", timestamp: "t3", message: { content: [{ type: "tool_result", tool_use_id: "tu1", content: "out", is_error: true }] } },
      { type: "user", timestamp: "t4", message: { content: "plain string" } },
      { type: "custom-title", timestamp: "t5", customTitle: "Renamed" },
      { type: "summary", timestamp: "t6", summary: { model: "m", usage: { input_tokens: 1, output_tokens: 2 } } },
    ];
    fs.writeFileSync(path.join(projectDir, "abc.jsonl"),
      lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n");

    const { res, abort } = await open("abc");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const events = await readUntilReady(res);
    abort();

    expect(events.map((e) => e.event)).toEqual([
      "todos", "user_msg",
      "thinking", "text", "tool", "tool", "tool", "usage",
      "tool_result", "user_msg", "custom_title", "usage", "ready",
    ]);
    expect(events[1].data).toEqual({ text: "hello", timestamp: "t1" });
    expect(events[4].data).toMatchObject({ name: "Bash", summary: "ls -la" });
    expect(events[5].data).toMatchObject({ name: "Read", summary: "b/c/d.ts" });
    expect(events[6].data).toMatchObject({ name: "Custom", summary: '{"k":1}' });
    expect(events[7].data).toMatchObject({ input_tokens: 10, output_tokens: 5, cache_read: 3, cache_creation: 0, model: "claude-sonnet" });
    expect(events[8].data).toMatchObject({ content: "out", is_error: true, tool_use_id: "tu1" });
    expect(events[10].data).toMatchObject({ customTitle: "Renamed" });
    expect(events[12].data).toEqual({ sessionId: "abc", filePath: "projects/-Users-me-Sites-proj/abc.jsonl" });
  });

  it("emits only ready for an empty file", async () => {
    fs.writeFileSync(path.join(projectDir, "empty.jsonl"), "");
    const { res, abort } = await open("empty");
    const events = await readUntilReady(res);
    abort();
    expect(events.map((e) => e.event)).toEqual(["ready"]);
  });
});
