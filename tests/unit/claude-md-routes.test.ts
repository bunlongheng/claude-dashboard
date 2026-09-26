import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NextRequest } from "next/server";

// Behavioral tests for app/api/claude/claude-md/route.ts (project CLAUDE.md
// reader, resolved from process.cwd()) and claude-md-history/route.ts (the
// ~/.claude/CLAUDE.md version log in the dashboard sqlite, pointed at a tmp
// file via SQLITE_PATH).

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
const savedSqlitePath = process.env.SQLITE_PATH;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-md-"));
  overrides.homedir = () => tmpHome;
  fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
  process.env.SQLITE_PATH = path.join(tmpHome, "dashboard.db");
});

afterEach(() => {
  delete overrides.homedir;
  vi.restoreAllMocks();
  if (savedSqlitePath === undefined) delete process.env.SQLITE_PATH;
  else process.env.SQLITE_PATH = savedSqlitePath;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("GET /api/claude/claude-md", () => {
  it("returns the project CLAUDE.md content from cwd", async () => {
    fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "# project rules\n");
    vi.spyOn(process, "cwd").mockReturnValue(tmpHome);
    const { GET } = await import("@/app/api/claude/claude-md/route");
    const res = await GET(new Request("http://localhost/api/claude/claude-md"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: "# project rules\n" });
  });

  it("returns empty content when the file is missing", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tmpHome);
    const { GET } = await import("@/app/api/claude/claude-md/route");
    const res = await GET(new Request("http://localhost/api/claude/claude-md"), undefined);
    expect(await res.json()).toEqual({ content: "" });
  });
});

describe("GET /api/claude/claude-md-history", () => {
  async function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/claude-md-history/route");
  }
  const req = (q = "") => new NextRequest(`http://localhost/api/claude/claude-md-history${q}`);

  it("returns 404 when ~/.claude/CLAUDE.md does not exist", async () => {
    const { GET } = await loadRoute();
    const res = await GET(req(), undefined);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "CLAUDE.md not found" });
  });

  it("snapshots the current file on first read and does not duplicate an unchanged one", async () => {
    fs.writeFileSync(path.join(tmpHome, ".claude", "CLAUDE.md"), "v1");
    const { GET } = await loadRoute();
    const first = await (await GET(req(), undefined)).json();
    expect(first.total).toBe(1);
    expect(first.current).toMatchObject({ content: "v1", size: 2 });
    expect(first.current.hash).toMatch(/^[0-9a-f]{32}$/);
    expect(first.versions[0]).not.toHaveProperty("content");

    const second = await (await GET(req(), undefined)).json();
    expect(second.total).toBe(1);

    fs.writeFileSync(path.join(tmpHome, ".claude", "CLAUDE.md"), "v2");
    const third = await (await GET(req(), undefined)).json();
    expect(third.total).toBe(2);
    expect(third.versions[0].id).toBe(2);
  });

  it("returns a single version by id and 404 for an unknown id", async () => {
    fs.writeFileSync(path.join(tmpHome, ".claude", "CLAUDE.md"), "v1");
    const { GET } = await loadRoute();
    await GET(req(), undefined);
    const hit = await GET(req("?id=1"), undefined);
    expect(hit.status).toBe(200);
    expect((await hit.json()).version).toMatchObject({ id: 1, content: "v1" });
    expect((await GET(req("?id=99"), undefined)).status).toBe(404);
  });

  it("returns the stored version alongside the current file for ?diff=", async () => {
    fs.writeFileSync(path.join(tmpHome, ".claude", "CLAUDE.md"), "v1");
    const { GET } = await loadRoute();
    await GET(req(), undefined);
    fs.writeFileSync(path.join(tmpHome, ".claude", "CLAUDE.md"), "v2");
    const body = await (await GET(req("?diff=1"), undefined)).json();
    expect(body.version.content).toBe("v1");
    expect(body.current.content).toBe("v2");
    expect((await GET(req("?diff=99"), undefined)).status).toBe(404);
  });
});
