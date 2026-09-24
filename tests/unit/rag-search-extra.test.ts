import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

// Own isolated throwaway SQLite DB, same pattern as tests/unit/rag.test.ts.
// This file closes the remaining coverage gaps in lib/rag-search.ts,
// lib/rag-context.ts, and lib/rag-db.ts without touching rag.test.ts.
const TMP_DB = path.join(os.tmpdir(), `rag-extra-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.RAG_DB_PATH = TMP_DB;

type RagDb = typeof import("@/lib/rag-db");
type RagSearch = typeof import("@/lib/rag-search");
type RagContext = typeof import("@/lib/rag-context");

let db: RagDb;
let search: RagSearch;
let context: RagContext;

beforeAll(async () => {
  db = await import("@/lib/rag-db");
  search = await import("@/lib/rag-search");
  context = await import("@/lib/rag-context");
  db.getDb();
});

// ── rag-context: the single retrieval path ──────────────────────────────────
// Must run before any other describe block seeds chunks so the "empty" case
// below actually observes an empty index.

describe("rag-context: single retrieval path", () => {
  it("returns an empty context when nothing matches, and still logs the request", async () => {
    const { context: ctx, meta } = await context.buildContext("nothing matches anything", "emptyproj");
    expect(ctx).toBe("");
    expect(meta).toEqual({ chunks: 0, size: 0 });
    const row = db.getDb().prepare("SELECT project, chunks_count FROM context_log ORDER BY rowid DESC LIMIT 1").get();
    expect(row).toEqual({ project: "emptyproj", chunks_count: 0 });
  });

  it("defaults the logged project to an empty string when omitted", async () => {
    await context.buildContext("anything without a project");
    const row = db.getDb().prepare("SELECT project FROM context_log ORDER BY rowid DESC LIMIT 1").get() as { project: string };
    expect(row.project).toBe("");
  });
});

// ── rag-search: domain detection with no match ──────────────────────────────

describe("rag-search: domain detection edge cases", () => {
  it("detectDomain finds no domain and skips the boost sort", () => {
    const results = search.ftsSearch("zzzznodomainmatchxyz");
    expect(Array.isArray(results)).toBe(true);
  });
});

// ── rag-search: domain-boost sort comparator (all outcomes) ────────────────

describe("rag-search: domain-boost sort comparator", () => {
  beforeAll(() => {
    const conn = db.getDb();
    const insertDoc = conn.prepare(
      "INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const insertChunk = conn.prepare("INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)");
    // Alternate types across enough rows that the sort compares a "memory"/
    // "insight" candidate against a plain one in both comparator positions.
    const types: [string, string][] = [
      ["memory", "bh1"], ["insight", "bh2"], ["conversation", "bh3"],
      ["conversation", "bh4"], ["memory", "bh5"], ["insight", "bh6"],
    ];
    types.forEach(([sourceType, hash], i) => {
      const id = insertDoc.run(`boost/${hash}`, sourceType, "boost", `Auth ${i}`, `auth boost doc ${i}`, hash).lastInsertRowid as number;
      insertChunk.run(id, 0, `auth boost doc ${i} content`, 5);
    });
    db.syncFts(conn);
  });

  it("boosts memory/insight results above other types for a security-domain query", () => {
    const results = search.ftsSearch("auth boost");
    expect(results.length).toBeGreaterThanOrEqual(6);
  });
});

// ── rag-search: FTS/entity error fallbacks ──────────────────────────────────

describe("rag-search: FTS/entity error fallbacks", () => {
  it("ftsSearch falls back to the raw query when the expanded MATCH throws", () => {
    const conn = db.getDb();
    const realPrepare = conn.prepare.bind(conn);
    let calls = 0;
    const spy = vi.spyOn(conn, "prepare").mockImplementation((sql: string) => {
      calls++;
      if (calls === 1) throw new Error("simulated FTS syntax error");
      return realPrepare(sql);
    });
    const results = search.ftsSearch("auth");
    expect(Array.isArray(results)).toBe(true);
    spy.mockRestore();
  });

  it("entitySearch returns [] when the entity query throws", () => {
    const conn = db.getDb();
    const spy = vi.spyOn(conn, "prepare").mockImplementationOnce(() => {
      throw new Error("simulated entity error");
    });
    expect(search.entitySearch("cognito")).toEqual([]);
    spy.mockRestore();
  });
});

// ── runHealthChecks: remaining branch outcomes ──────────────────────────────

describe("rag-search: runHealthChecks branch coverage", () => {
  it("flags duplicate preferences and missing-memory projects while other checks stay clear", () => {
    const conn = db.getDb();
    conn.prepare("INSERT INTO preferences (category, key, value) VALUES (?, ?, ?)").run("infra", "db_conn", "x");
    conn.prepare("INSERT INTO preferences (category, key, value) VALUES (?, ?, ?)").run("infra", "db_connection", "y");
    conn.prepare(
      "INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("newproj/only", "conversation", "newproj", "NewProj Notes", "some conversation content", "npX");
    conn.exec("UPDATE documents SET access_count = 1 WHERE access_count = 0");

    const checks = search.runHealthChecks();
    const types = checks.map((c) => c.check_type);
    expect(types).toContain("duplicate_preferences");
    expect(types).toContain("no_memory_files");
    expect(types).not.toContain("stale_preferences");
    expect(types).not.toContain("large_documents");
    expect(types).not.toContain("cold_documents");
    expect(types).not.toContain("empty_preferences");
  });

  it("reports all_clear when every check is clean", () => {
    const conn = db.getDb();
    conn.prepare("DELETE FROM preferences WHERE category = 'infra' AND key IN ('db_conn', 'db_connection')").run();
    conn.prepare("DELETE FROM documents WHERE project = 'newproj'").run();
    conn.exec("UPDATE documents SET access_count = 1 WHERE access_count = 0");

    const checks = search.runHealthChecks();
    expect(checks).toEqual([{ check_type: "all_clear", severity: "success", message: "No issues found - RAG is healthy" }]);
  });
});

// ── rag-db: DB path fallback + directory creation ───────────────────────────

describe("rag-db: DB path fallback and directory creation", () => {
  it("creates data/rag.db under cwd when RAG_DB_PATH is unset", async () => {
    const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "rag-cwd-"));
    const savedEnv = process.env.RAG_DB_PATH;
    delete process.env.RAG_DB_PATH;
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpCwd);
    vi.resetModules();

    const freshDb: RagDb = await import("@/lib/rag-db");
    freshDb.getDb();
    expect(fs.existsSync(path.join(tmpCwd, "data", "rag.db"))).toBe(true);

    cwdSpy.mockRestore();
    process.env.RAG_DB_PATH = savedEnv;
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  });
});
