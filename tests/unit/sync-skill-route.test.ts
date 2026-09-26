import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server";

// Behavioral tests for app/api/claude/sync-skill/route.ts, the 3-hop
// copy-a-skill orchestrator. The local machine resolves from LOCAL_MACHINE_ID +
// LOCAL_APPS_PORT; the peer comes from a throwaway machines registry sqlite
// pointed at by MACHINES_DB_PATH. All 3 peer hops are MSW stubs.

const SAME_SITE = { "sec-fetch-site": "same-origin", host: "localhost:3003", origin: "http://localhost:3003" };
const FOREIGN = { "sec-fetch-site": "cross-site", host: "localhost:3003", origin: "https://evil.example" };

const LOCAL = "http://localhost:9876";
const PEER = "http://10.0.0.5:3003";
const SKILL_PATH = "/api/claude/skill/my-plugin/my-skill";

let tmpDir: string;
const savedEnv = {
  LOCAL_MACHINE_ID: process.env.LOCAL_MACHINE_ID,
  LOCAL_APPS_PORT: process.env.LOCAL_APPS_PORT,
  MACHINES_DB_PATH: process.env.MACHINES_DB_PATH,
};

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-skill-"));
  const dbPath = path.join(tmpDir, "machines.db");
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);
  db.exec("CREATE TABLE machines (id TEXT PRIMARY KEY, hostname TEXT, ip TEXT, port INTEGER, model TEXT, last_seen TEXT)");
  db.prepare("INSERT INTO machines (id, hostname, ip, port, model, last_seen) VALUES (?, ?, ?, ?, ?, ?)")
    .run("pi5", "pi5", "10.0.0.5", 3003, "Pi", "2026-09-25T00:00:00Z");
  db.close();
  process.env.LOCAL_MACHINE_ID = "m4";
  process.env.LOCAL_APPS_PORT = "9876";
  process.env.MACHINES_DB_PATH = dbPath;
});

afterAll(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function post(body: unknown, headers: Record<string, string> = SAME_SITE) {
  vi.resetModules();
  const { POST } = await import("@/app/api/claude/sync-skill/route");
  const res = await POST(new Request("http://localhost/api/claude/sync-skill", {
    method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body),
  }), undefined);
  return { status: res.status, body: await res.json() };
}

const VALID = { from: "m4", to: "pi5", plugin: "my-plugin", skill: "my-skill" };

describe("POST /api/claude/sync-skill", () => {
  it("returns 403 for a foreign-Origin caller", async () => {
    const { status } = await post(VALID, FOREIGN);
    expect(status).toBe(403);
  });

  it("returns 400 when a required field is missing", async () => {
    const { status, body } = await post({ from: "m4", to: "pi5", plugin: "p" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/missing/);
  });

  it("returns 400 when source and target are the same machine", async () => {
    const { status } = await post({ ...VALID, to: "m4" });
    expect(status).toBe(400);
  });

  it("returns 404 for a machine that is not in the registry", async () => {
    expect((await post({ ...VALID, to: "ghost" })).status).toBe(404);
    expect((await post({ ...VALID, from: "ghost" })).status).toBe(404);
  });

  it("returns 409 when the skill already exists on the target", async () => {
    server.use(http.get(`${PEER}${SKILL_PATH}`, () => HttpResponse.json({ files: {} })));
    const { status, body } = await post(VALID);
    expect(status).toBe(409);
    expect(body.error).toMatch(/already exists/);
  });

  it("returns 404 when the skill is missing on the source", async () => {
    server.use(
      http.get(`${PEER}${SKILL_PATH}`, () => HttpResponse.json({ error: "nope" }, { status: 404 })),
      http.get(`${LOCAL}${SKILL_PATH}`, () => HttpResponse.json({ error: "nope" }, { status: 404 })),
    );
    const { status, body } = await post(VALID);
    expect(status).toBe(404);
    expect(body.error).toMatch(/source/);
  });

  it("returns 502 when the source machine is unreachable", async () => {
    server.use(
      http.get(`${PEER}${SKILL_PATH}`, () => HttpResponse.json({}, { status: 404 })),
      http.get(`${LOCAL}${SKILL_PATH}`, () => HttpResponse.error()),
    );
    const { status, body } = await post(VALID);
    expect(status).toBe(502);
    expect(body.error).toMatch(/source machine/);
  });

  it("returns 502 with the target's error when the write fails", async () => {
    server.use(
      http.get(`${PEER}${SKILL_PATH}`, () => HttpResponse.json({}, { status: 404 })),
      http.get(`${LOCAL}${SKILL_PATH}`, () => HttpResponse.json({ files: { "SKILL.md": "# hi" } })),
      http.post(`${PEER}${SKILL_PATH}`, () => HttpResponse.json({ error: "disk full" }, { status: 500 })),
    );
    const { status, body } = await post(VALID);
    expect(status).toBe(502);
    expect(body.error).toBe("disk full");
  });

  it("copies the source files to the target and returns ok", async () => {
    let written: unknown = null;
    server.use(
      http.get(`${PEER}${SKILL_PATH}`, () => HttpResponse.json({}, { status: 404 })),
      http.get(`${LOCAL}${SKILL_PATH}`, () => HttpResponse.json({ files: { "SKILL.md": "# hi" } })),
      http.post(`${PEER}${SKILL_PATH}`, async ({ request }) => {
        written = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const { status, body } = await post(VALID);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, skill: "my-skill", from: "m4", to: "pi5" });
    expect(written).toEqual({ files: { "SKILL.md": "# hi" } });
  });
});
