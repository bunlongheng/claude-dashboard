import { describe, it, expect, beforeAll } from "vitest";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

// Point the RAG layer at a throwaway SQLite DB before importing it so the real
// data/rag.db is never touched. rag-db reads RAG_DB_PATH at import time.
const TMP_DB = path.join(os.tmpdir(), `rag-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.RAG_DB_PATH = TMP_DB;
delete process.env.ANTHROPIC_API_KEY; // force the no-LLM rerank path

type RagDb = typeof import("@/lib/rag-db");
type RagSearch = typeof import("@/lib/rag-search");
type RagContext = typeof import("@/lib/rag-context");

let db: RagDb;
let search: RagSearch;
let context: RagContext;
let firstChunkId: number;

beforeAll(async () => {
  db = await import("@/lib/rag-db");
  search = await import("@/lib/rag-search");
  context = await import("@/lib/rag-context");

  const conn = db.getDb();

  // Seed documents + chunks
  const insertDoc = conn.prepare(
    "INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const d1 = insertDoc.run("p/auth", "memory", "claude", "Auth Notes", "We use authentication oauth login with cognito", "h1").lastInsertRowid as number;
  const d2 = insertDoc.run("p/deploy", "conversation", "claude", "Deploy Notes", "Deploy to vercel production with caddy", "h2").lastInsertRowid as number;
  insertDoc.run("p/big", "memory", "claude", "Big Doc", "x".repeat(10001), "h3");

  const insertChunk = conn.prepare("INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)");
  firstChunkId = insertChunk.run(d1, 0, "We use authentication oauth login with cognito here", 12).lastInsertRowid as number;
  insertChunk.run(d2, 0, "Deploy to vercel production with caddy reverse proxy", 11);

  // Preferences: one normal, one stale, one empty-valued
  const insertPref = conn.prepare("INSERT INTO preferences (category, key, value) VALUES (?, ?, ?)");
  insertPref.run("stack", "framework", "Next.js 16");
  insertPref.run("workflow", "commit", "");
  conn.prepare("INSERT INTO preferences (category, key, value, last_accessed) VALUES (?, ?, ?, datetime('now','-60 days'))")
    .run("infra", "host", "Vercel");

  // Entities for entitySearch
  const e1 = conn.prepare("INSERT INTO entities (name, type) VALUES (?, ?)").run("cognito", "tool").lastInsertRowid as number;
  const e2 = conn.prepare("INSERT INTO entities (name, type) VALUES (?, ?)").run("vercel", "tool").lastInsertRowid as number;
  conn.prepare("INSERT INTO entity_links (source_id, target_id, relation, doc_id) VALUES (?, ?, ?, ?)").run(e1, e2, "related", d1);

  db.syncFts(conn);
});

describe("rag-db", () => {
  it("creates the schema and returns a singleton connection", () => {
    expect(db.getDb()).toBe(db.getDb());
  });

  it("writes to the isolated temp database", () => {
    expect(fs.existsSync(TMP_DB)).toBe(true);
  });

  it("syncFts populates the FTS index from chunks", () => {
    const conn = db.getDb();
    const ftsCount = (conn.prepare("SELECT COUNT(*) as c FROM chunks_fts").get() as { c: number }).c;
    const chunkCount = (conn.prepare("SELECT COUNT(*) as c FROM chunks").get() as { c: number }).c;
    expect(ftsCount).toBe(chunkCount);
  });
});

describe("rag-search", () => {
  it("ftsSearch finds chunks via query expansion (auth -> oauth/cognito)", () => {
    const results = search.ftsSearch("auth");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty("chunk_id");
    expect(results[0]).toHaveProperty("project", "claude");
  });

  it("ftsSearch applies domain boosting for security queries without error", () => {
    expect(Array.isArray(search.ftsSearch("auth login jwt"))).toBe(true);
  });

  it("ftsSearchCompact returns a trimmed single-line preview", () => {
    const compact = search.ftsSearchCompact("vercel");
    expect(compact.length).toBeGreaterThan(0);
    expect(compact[0].preview.length).toBeLessThanOrEqual(120);
    expect(compact[0].preview).not.toContain("\n");
  });

  it("getChunksByIds returns [] for an empty id list", () => {
    expect(search.getChunksByIds([])).toEqual([]);
  });

  it("getChunksByIds returns rows for known ids", () => {
    const rows = search.getChunksByIds([firstChunkId]);
    expect(rows.length).toBe(1);
    expect(rows[0].chunk_id).toBe(firstChunkId);
  });

  it("entitySearch returns an array", () => {
    expect(Array.isArray(search.entitySearch("cognito"))).toBe(true);
  });

  it("searchWithRerank returns candidates without an API key", async () => {
    const out = await search.searchWithRerank("authentication", 5);
    expect(Array.isArray(out)).toBe(true);
  });

  it("runHealthChecks flags the seeded issues and returns an array", () => {
    const checks = search.runHealthChecks();
    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThan(0);
    const types = checks.map((c) => c.check_type);
    expect(types).toContain("stale_preferences");
    expect(types).toContain("empty_preferences");
    expect(types).toContain("large_documents");
  });

  it("runHealthChecks is idempotent (clears prior rows each run)", () => {
    const countRows = () => (db.getDb().prepare("SELECT COUNT(*) as c FROM health_checks").get() as { c: number }).c;
    search.runHealthChecks();
    const first = countRows();
    search.runHealthChecks();
    expect(countRows()).toBe(first);
  });

  it("getStats reports the seeded counts", () => {
    const stats = search.getStats();
    expect(stats.documents).toBe(3);
    expect(stats.chunks).toBe(2);
    expect(stats.preferences).toBe(3);
    expect(Array.isArray(stats.typeCounts)).toBe(true);
    expect(Array.isArray(stats.searchBenchmark)).toBe(true);
  });
});

describe("rag-context", () => {
  it("buildContext assembles preferences + relevant chunks and logs the injection", async () => {
    const { context: ctx, meta } = await context.buildContext("authentication oauth", "claude");
    expect(typeof ctx).toBe("string");
    expect(ctx).toContain("Your Preferences");
    expect(meta.prefs).toBe(3);
    expect(meta.size).toBe(ctx.length);
    const logged = (db.getDb().prepare("SELECT COUNT(*) as c FROM context_log").get() as { c: number }).c;
    expect(logged).toBeGreaterThan(0);
  });
});
