import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Behavioral tests for the RAG routes that had no coverage yet: search
// (flagship), ingest, docs (list + by-id), context, preferences, mode, and
// (as a bonus) insights + eval/questions. Follows the isolated-throwaway-db
// pattern from tests/unit/rag-routes.test.ts and tests/unit/rag-search-extra.test.ts
// (RAG_DB_PATH env var, read at import time by lib/rag-db.ts; vi.resetModules()
// per test to force a fresh db singleton) plus the os.homedir()-override
// pattern from tests/unit/claude-routes.test.ts (only exercised by the ingest
// route, which walks ~/.claude and ~/Sites).
//
// app/api/rag/eval/route.ts was left out: it runs a real eval batch against
// assembleContext()/LLM judging (lib/eval/*), which is exercised at the
// integration layer (tests/unit/eval-run.test.ts etc.), not as a route smoke.

const overrides: { homedir?: typeof os.homedir } = {};

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    ...actual,
    homedir: (...args: Parameters<typeof actual.homedir>) =>
      overrides.homedir ? overrides.homedir(...args) : actual.homedir(...args),
  };
});

async function freshDb(): Promise<void> {
  const dbPath = path.join(os.tmpdir(), `rag-search-routes-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  process.env.RAG_DB_PATH = dbPath;
  delete process.env.ANTHROPIC_API_KEY;
  vi.resetModules();
}

// ─── GET /api/rag/search (flagship) ────────────────────────────────────────

// Mutations pass lib/route-guard.ts only as a same-origin fetch from a trusted
// host. LOCAL_TOOL is the no-browser-headers shape the hooks/MCP curls send,
// accepted only by the softer requireSameSiteOrLocalTool guard.
const SAME_SITE = { "sec-fetch-site": "same-origin", host: "localhost:3003" };
const LOCAL_TOOL = { host: "localhost:3003" };
const FOREIGN = { origin: "http://evil.example", host: "localhost:3003" };

describe("GET /api/rag/search", () => {
  it("returns 400 when q is missing", async () => {
    await freshDb();
    const { GET } = await import("@/app/api/rag/search/route");
    const req = { nextUrl: new URL("http://localhost/api/rag/search") } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req as never, {} as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/q required/);
  });

  it("returns 400 for a blank/whitespace-only q", async () => {
    await freshDb();
    const { GET } = await import("@/app/api/rag/search/route");
    const req = { nextUrl: new URL("http://localhost/api/rag/search?q=%20%20") } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req as never, {} as never);
    expect(res.status).toBe(400);
  });

  it("returns an empty results array for a query with no matching chunks", async () => {
    await freshDb();
    const { GET } = await import("@/app/api/rag/search/route");
    const req = { nextUrl: new URL("http://localhost/api/rag/search?q=zzznomatchxyz") } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req as never, {} as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.query).toBe("zzznomatchxyz");
    expect(data.results).toEqual([]);
  });

  it("ranks and returns a seeded chunk for a matching query, and logs the search", async () => {
    await freshDb();
    const dbMod = await import("@/lib/rag-db");
    const db = dbMod.getDb();
    const docId = db.prepare(
      `INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)`
    ).run("/tmp/auth.md", "memory", "demoapp", "Auth Notes", "cognito auth setup", "hash-auth").lastInsertRowid as number;
    db.prepare(`INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)`)
      .run(docId, 0, "use cognito for authentication in demoapp", 5);
    dbMod.syncFts(db);

    const { GET } = await import("@/app/api/rag/search/route");
    const req = { nextUrl: new URL("http://localhost/api/rag/search?q=cognito") } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req as never, {} as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.length).toBe(1);
    expect(data.results[0]).toMatchObject({ doc_id: docId, project: "demoapp", title: "Auth Notes", source_type: "memory" });
    expect(typeof data.results[0].score).toBe("number");

    const logged = db.prepare("SELECT results_count FROM search_log WHERE query = ?").get("cognito") as { results_count: number };
    expect(logged.results_count).toBe(1);
  });

  it("returns a compact preview shape (no full content) when compact=true", async () => {
    await freshDb();
    const dbMod = await import("@/lib/rag-db");
    const db = dbMod.getDb();
    const docId = db.prepare(
      `INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)`
    ).run("/tmp/deploy.md", "memory", "demoapp", "Deploy Notes", "vercel deploy notes", "hash-deploy").lastInsertRowid as number;
    db.prepare(`INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)`)
      .run(docId, 0, "deploy to vercel on every push to main", 5);
    dbMod.syncFts(db);

    const { GET } = await import("@/app/api/rag/search/route");
    const req = { nextUrl: new URL("http://localhost/api/rag/search?q=vercel&compact=true") } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req as never, {} as never);
    const data = await res.json();
    expect(data.results[0]).toHaveProperty("preview");
    expect(data.results[0].preview).toContain("deploy to vercel");
    expect(data.results[0]).not.toHaveProperty("content");
  });
});

// ─── POST /api/rag/ingest ───────────────────────────────────────────────────

describe("POST /api/rag/ingest", () => {
  let tmpHome: string;
  const prevHome = process.env.HOME;
  const prevProjectsDir = process.env.RAG_PROJECTS_DIR;
  const prevVaults = process.env.OBSIDIAN_VAULTS;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "rag-ingest-route-"));
    overrides.homedir = () => tmpHome;
    process.env.HOME = tmpHome;
    delete process.env.RAG_PROJECTS_DIR;
    delete process.env.OBSIDIAN_VAULTS;
  });

  afterEach(() => {
    delete overrides.homedir;
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevProjectsDir === undefined) delete process.env.RAG_PROJECTS_DIR; else process.env.RAG_PROJECTS_DIR = prevProjectsDir;
    if (prevVaults === undefined) delete process.env.OBSIDIAN_VAULTS; else process.env.OBSIDIAN_VAULTS = prevVaults;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("ingests a global CLAUDE.md, a project CLAUDE.md, a memory file, and a session file", async () => {
    await freshDb();
    overrides.homedir = () => tmpHome; // freshDb() called vi.resetModules(); homedir override survives since overrides object is outer scope
    process.env.HOME = tmpHome;

    // chunkByHeadings() (lib/rag-ingest.ts) only keeps a chunk once its trimmed
    // text exceeds 50 chars, so each fixture body needs to clear that bar.
    fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, ".claude", "CLAUDE.md"), "# Global rules\nUse hyphens, not dashes, in every commit message and file.\n");

    fs.mkdirSync(path.join(tmpHome, "Sites", "demoproj"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, "Sites", "demoproj", "CLAUDE.md"), "# Demo Project\nUses Next.js 16 App Router with Tailwind and Supabase.\n");

    fs.mkdirSync(path.join(tmpHome, ".claude", "projects", "demoproj", "memory"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, ".claude", "projects", "demoproj", "memory", "note.md"), "# A memory note\nSome remembered fact worth ingesting into the RAG store.\n");

    fs.writeFileSync(
      path.join(tmpHome, ".claude", "projects", "demoproj", "sess1.jsonl"),
      // ingestSessions() only keeps a chunk once its trimmed text exceeds 50
      // chars (lib/rag-ingest-sessions.ts), so this needs real headroom over that.
      JSON.stringify({ type: "user", message: { content: "a real user message that is definitely long enough to clear the fifty character chunk threshold" } }) + "\n"
    );

    const { POST } = await import("@/app/api/rag/ingest/route");
    const res = await POST(new Request("http://localhost/", { method: "POST", headers: SAME_SITE }), {} as never);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.memory).toMatchObject({ total: 3, created: 3, updated: 0, skipped: 0 });
    expect(data.memory.chunks).toBeGreaterThan(0);
    expect(data.memory.prefsExtracted).toBe(0); // no ANTHROPIC_API_KEY

    expect(data.sessions).toMatchObject({ total: 1, created: 1, skipped: 0 });
    expect(data.sessions.chunks).toBeGreaterThan(0);

    const dbMod = await import("@/lib/rag-db");
    const db = dbMod.getDb();
    const count = db.prepare("SELECT COUNT(*) as c FROM documents").get() as { c: number };
    expect(count.c).toBe(4); // 3 memory-ingest docs + 1 session doc
  });

  it("re-ingesting unchanged files reports them all as skipped", async () => {
    await freshDb();
    overrides.homedir = () => tmpHome;
    process.env.HOME = tmpHome;

    fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, ".claude", "CLAUDE.md"), "# Global rules\nStable content.\n");

    const { POST } = await import("@/app/api/rag/ingest/route");
    const first = await (await POST(new Request("http://localhost/", { method: "POST", headers: SAME_SITE }), {} as never)).json();
    expect(first.memory.created).toBe(1);

    const second = await (await POST(new Request("http://localhost/", { method: "POST", headers: SAME_SITE }), {} as never)).json();
    expect(second.memory).toMatchObject({ total: 1, created: 0, updated: 0, skipped: 1 });
  });
});

// ─── GET /api/rag/docs and GET /api/rag/docs/[id] ──────────────────────────

describe("GET /api/rag/docs and /api/rag/docs/[id]", () => {
  async function seedTwoDocs() {
    const dbMod = await import("@/lib/rag-db");
    const db = dbMod.getDb();
    const insertDoc = db.prepare(
      `INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const id1 = insertDoc.run("/tmp/a.md", "memory", "proj-a", "Doc A", "line one\nline two", "hash-a").lastInsertRowid as number;
    const id2 = insertDoc.run("/tmp/b.md", "conversation", "proj-b", "Doc B", "single line", "hash-b").lastInsertRowid as number;
    db.prepare(`INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)`).run(id1, 0, "chunk one", 3);
    db.prepare(`INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)`).run(id1, 1, "chunk two", 3);
    return { db, id1, id2 };
  }

  it("lists all documents with computed size/line_count/chunk_count", async () => {
    await freshDb();
    const { id1 } = await seedTwoDocs();
    const { GET } = await import("@/app/api/rag/docs/route");
    const req = { nextUrl: new URL("http://localhost/api/rag/docs") } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req as never, {} as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    const docA = data.find((d: { id: number }) => d.id === id1);
    expect(docA).toMatchObject({ project: "proj-a", source_type: "memory", chunk_count: 2, line_count: 2 });
  });

  it("filters the list by project and by type query params", async () => {
    await freshDb();
    await seedTwoDocs();
    const { GET } = await import("@/app/api/rag/docs/route");

    const byProject = await GET({ nextUrl: new URL("http://localhost/api/rag/docs?project=proj-b") } as unknown as Parameters<typeof GET>[0], {} as never);
    const byProjectData = await byProject.json();
    expect(byProjectData).toHaveLength(1);
    expect(byProjectData[0].project).toBe("proj-b");

    const byType = await GET({ nextUrl: new URL("http://localhost/api/rag/docs?type=conversation") } as unknown as Parameters<typeof GET>[0], {} as never);
    const byTypeData = await byType.json();
    expect(byTypeData).toHaveLength(1);
    expect(byTypeData[0].source_type).toBe("conversation");
  });

  it("fetches a single document by id with its ordered chunks", async () => {
    await freshDb();
    const { id1 } = await seedTwoDocs();
    const { GET } = await import("@/app/api/rag/docs/[id]/route");
    const req = new Request(`http://localhost/api/rag/docs/${id1}`);
    const res = await GET(req as never, { params: Promise.resolve({ id: String(id1) }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("Doc A");
    expect(data.chunks).toHaveLength(2);
    expect(data.chunks.map((c: { content: string }) => c.content)).toEqual(["chunk one", "chunk two"]);
  });

  it("returns 404 for a missing document id", async () => {
    await freshDb();
    const { GET } = await import("@/app/api/rag/docs/[id]/route");
    const req = new Request("http://localhost/api/rag/docs/999999");
    const res = await GET(req as never, { params: Promise.resolve({ id: "999999" }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Not found");
  });
});

// ─── POST /api/rag/context ─────────────────────────────────────────────────

describe("POST /api/rag/context", () => {
  it("returns 400 when prompt is missing/blank", async () => {
    await freshDb();
    const { POST } = await import("@/app/api/rag/context/route");
    const req = new Request("http://localhost/api/rag/context", { method: "POST", headers: SAME_SITE, body: JSON.stringify({ prompt: "  " }) });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {} as never);
    expect(res.status).toBe(400);
  });

  it("assembles the matching chunks into the context block", async () => {
    await freshDb();
    const dbMod = await import("@/lib/rag-db");
    const db = dbMod.getDb();
    const docId = db.prepare(
      `INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)`
    ).run("/tmp/ctx.md", "memory", "demoapp", "Ctx Doc", "widget setup notes", "hash-ctx").lastInsertRowid as number;
    db.prepare(`INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)`)
      .run(docId, 0, "widget setup notes for demoapp", 5);
    dbMod.syncFts(db);

    const { POST } = await import("@/app/api/rag/context/route");
    const req = new Request("http://localhost/api/rag/context", {
      method: "POST",
      headers: SAME_SITE,
      body: JSON.stringify({ prompt: "widget setup", project: "demoapp" }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {} as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.context).toContain("[demoapp/Ctx Doc]");
    expect(data.context).toContain("widget setup notes for demoapp");
    expect(data.meta).toMatchObject({ chunks: 1 });
    expect(data.meta.size).toBe(data.context.length);

    const logged = db.prepare("SELECT COUNT(*) as c FROM context_log WHERE project = ?").get("demoapp") as { c: number };
    expect(logged.c).toBe(1);
  });
});

// ─── GET /api/rag/preferences ───────────────────────────────────────────────

describe("GET /api/rag/preferences", () => {
  async function seedPrefs() {
    const dbMod = await import("@/lib/rag-db");
    const db = dbMod.getDb();
    db.prepare("INSERT INTO preferences (category, key, value) VALUES (?, ?, ?)").run("style", "dashes", "hyphens only");
    db.prepare("INSERT INTO preferences (category, key, value) VALUES (?, ?, ?)").run("infra", "port", "3003");
  }

  it("returns full preference rows by default, ordered by category/key", async () => {
    await freshDb();
    await seedPrefs();
    const { GET } = await import("@/app/api/rag/preferences/route");
    const req = { nextUrl: new URL("http://localhost/api/rag/preferences") } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req as never, {} as never);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data.map((p: { category: string }) => p.category)).toEqual(["infra", "style"]);
    expect(data[0]).toHaveProperty("value", "3003");
  });

  // slim=1 returns the trimmed projection (id, category, key, confidence,
  // created_at) - no "project" column, which the preferences table never had.
  it("slim=1 returns the trimmed row shape", async () => {
    await freshDb();
    await seedPrefs();
    const { GET } = await import("@/app/api/rag/preferences/route");
    const req = { nextUrl: new URL("http://localhost/api/rag/preferences?slim=1") } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req as never, {} as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toHaveProperty("category");
    expect(data[0]).not.toHaveProperty("value");
  });
});

// ─── POST /api/rag/insights (bonus: no-API-key no-op path) ──────────────────

describe("POST /api/rag/insights", () => {
  it("extracts nothing and returns extracted:0 when ANTHROPIC_API_KEY is unset", async () => {
    await freshDb();
    const { POST } = await import("@/app/api/rag/insights/route");
    const res = await POST(new Request("http://localhost/", { method: "POST", headers: SAME_SITE }), {} as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ extracted: 0 });
  });
});

// ─── GET/POST/DELETE /api/rag/eval/questions (bonus) ────────────────────────

describe("GET/POST/DELETE /api/rag/eval/questions", () => {
  it("GET returns an empty list against a fresh db", async () => {
    await freshDb();
    const { GET } = await import("@/app/api/rag/eval/questions/route");
    const data = await (await GET(new Request("http://localhost/"), {} as never)).json();
    expect(data).toEqual({ questions: [] });
  });

  it("POST inserts questions and GET reflects them", async () => {
    await freshDb();
    const { POST, GET } = await import("@/app/api/rag/eval/questions/route");
    const req = new Request("http://localhost/api/rag/eval/questions", {
      method: "POST",
      headers: SAME_SITE,
      body: JSON.stringify({ questions: [{ question: "What port does the dashboard run on?", expected: "3003", tags: "infra" }] }),
    });
    const postData = await (await POST(req as unknown as Parameters<typeof POST>[0], {} as never)).json();
    expect(postData).toEqual({ ok: true, count: 1 });

    const getData = await (await GET(new Request("http://localhost/"), {} as never)).json();
    expect(getData.questions).toHaveLength(1);
    expect(getData.questions[0]).toMatchObject({ question: "What port does the dashboard run on?", expected: "3003" });
  });

  it("POST with replace:true clears existing questions before inserting", async () => {
    await freshDb();
    const { POST } = await import("@/app/api/rag/eval/questions/route");
    const seedReq = new Request("http://localhost/api/rag/eval/questions", {
      method: "POST",
      headers: SAME_SITE,
      body: JSON.stringify({ questions: [{ question: "old question" }] }),
    });
    await POST(seedReq as unknown as Parameters<typeof POST>[0], {} as never);

    const replaceReq = new Request("http://localhost/api/rag/eval/questions", {
      method: "POST",
      headers: SAME_SITE,
      body: JSON.stringify({ questions: [{ question: "new question" }], replace: true }),
    });
    const data = await (await POST(replaceReq as unknown as Parameters<typeof POST>[0], {} as never)).json();
    expect(data).toEqual({ ok: true, count: 1 });
  });

  it("DELETE clears all questions", async () => {
    await freshDb();
    const { POST, DELETE, GET } = await import("@/app/api/rag/eval/questions/route");
    await POST(new Request("http://localhost/x", { method: "POST", headers: SAME_SITE, body: JSON.stringify({ questions: [{ question: "q1" }] }) }) as unknown as Parameters<typeof POST>[0], {} as never);
    const delData = await (await DELETE(new Request("http://localhost/", { method: "DELETE", headers: SAME_SITE }), {} as never)).json();
    expect(delData).toEqual({ ok: true });
    const getData = await (await GET(new Request("http://localhost/"), {} as never)).json();
    expect(getData.questions).toEqual([]);
  });
});

// ─── Same-site guards on the mutating routes ────────────────────────────────

describe("route guards on POST /api/rag/*", () => {
  const send = (route: { POST: (r: never, c: never) => Promise<Response> }, headers: Record<string, string>) =>
    route.POST(new Request("http://localhost/x", { method: "POST", headers, body: "{}" }) as never, {} as never);

  it("ingest, context and insights accept a header-less local tool call but refuse a foreign Origin", async () => {
    // Empty tmp home so the allowed ingest call has nothing to walk.
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "rag-guard-"));
    const prevHome = process.env.HOME;
    overrides.homedir = () => tmpHome;
    process.env.HOME = tmpHome;
    delete process.env.RAG_PROJECTS_DIR;
    delete process.env.OBSIDIAN_VAULTS;
    try {
    for (const mod of ["ingest", "context", "insights"]) {
      await freshDb();
      const route = await import(`@/app/api/rag/${mod}/route`);
      expect((await send(route, LOCAL_TOOL)).status, `${mod} local tool`).not.toBe(403);
      expect((await send(route, FOREIGN)).status, `${mod} foreign origin`).toBe(403);
    }
    } finally {
      delete overrides.homedir;
      if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it("eval/questions POST and DELETE refuse a request without same-site headers", async () => {
    await freshDb();
    const { POST, DELETE } = await import("@/app/api/rag/eval/questions/route");
    expect((await POST(new Request("http://localhost/x", { method: "POST", headers: LOCAL_TOOL, body: "{}" }) as never, {} as never)).status).toBe(403);
    expect((await DELETE(new Request("http://localhost/x", { method: "DELETE", headers: FOREIGN }) as never, {} as never)).status).toBe(403);
  });
});
