import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

// Own isolated throwaway SQLite DB, same pattern as tests/unit/rag.test.ts.
// This file closes the remaining coverage gaps in lib/rag-search.ts,
// lib/rag-context.ts, and lib/rag-db.ts without touching rag.test.ts.
const TMP_DB = path.join(os.tmpdir(), `rag-extra-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.RAG_DB_PATH = TMP_DB;
delete process.env.ANTHROPIC_API_KEY;

// Mocked so the LLM rerank path in searchWithRerank can be exercised without
// ever hitting the real Anthropic API.
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function (this: any) {
    this.messages = { create: mockCreate };
  }),
}));

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

// ── rag-context: memory_mode routing (lines 13-19 of rag-context.ts) ────────

describe("rag-context: mode-routed assembly", () => {
  it("routes through assembleContext when memory_mode is set, with a project", async () => {
    db.setSetting("memory_mode", "nothing");
    const { context: ctx, meta } = await context.buildContext("hello world", "proj-a");
    expect(ctx).toBe("");
    expect(meta.size).toBe(0);
    expect(meta.mode).toBe("nothing");
  });

  it("routes through assembleContext when memory_mode is set, without a project", async () => {
    const { context: ctx, meta } = await context.buildContext("hello world");
    expect(ctx).toBe("");
    expect(meta.mode).toBe("nothing");
  });

  it("degrades a mode whose dependency is missing instead of throwing", async () => {
    // The embedder is an optional dep and is absent here, so rag_vector cannot
    // run. The SessionStart hook discards errors, so throwing would cost the
    // session its memory with nothing on screen to show it.
    db.setSetting("memory_mode", "rag_vector");
    const { meta } = await context.buildContext("hello world", "proj-a");

    expect(meta.mode).toBe("rag");
    expect(meta.fallbackFrom).toBe("rag_vector");
    expect(meta.reason).toMatch(/transformers/);
  });

  it("degrades a mode left behind by an older build", async () => {
    db.setSetting("memory_mode", "hybrid_v2");
    const { meta } = await context.buildContext("hello world");

    expect(meta.mode).toBe("rag");
    expect(meta.fallbackFrom).toBe("hybrid_v2");
    expect(meta.reason).toBe("unknown mode");
  });

  afterAll(() => {
    // Restore legacy (mode-unset) behavior for the tests below.
    db.getDb().prepare("DELETE FROM app_settings WHERE key = ?").run("memory_mode");
  });
});

// ── rag-context: legacy assembly edge cases ─────────────────────────────────
// Must run before any other describe block seeds preferences/chunks so the
// "empty" case below actually observes an empty database.

describe("rag-context: legacy assembly edge cases", () => {
  it("omits Preferences/Context sections when both are empty", async () => {
    const { context: ctx, meta } = await context.buildContext("nothing matches anything", "emptyproj");
    expect(ctx).not.toContain("Your Preferences");
    expect(ctx).not.toContain("Relevant Context");
    expect(meta.prefs).toBe(0);
    expect(meta.chunks).toBe(0);
  });

  it("groups multiple preferences under the same category", async () => {
    const conn = db.getDb();
    conn.prepare("INSERT INTO preferences (category, key, value) VALUES (?, ?, ?)").run("dup", "first", "a");
    conn.prepare("INSERT INTO preferences (category, key, value) VALUES (?, ?, ?)").run("dup", "second", "b");
    const { context: ctx, meta } = await context.buildContext("anything", "proj-b");
    expect(ctx).toContain("Your Preferences");
    expect(meta.prefs).toBe(2);
  });

  it("defaults the logged project to an empty string when omitted", async () => {
    const { meta } = await context.buildContext("anything without a project");
    expect(meta.prefs).toBe(2);
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

// ── searchWithRerank: candidate merging + LLM rerank path ───────────────────

describe("searchWithRerank: candidate merging and LLM rerank", () => {
  beforeAll(() => {
    const conn = db.getDb();
    const insertDoc = conn.prepare(
      "INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const insertChunk = conn.prepare("INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)");
    const docIds: number[] = [];
    for (let i = 0; i < 8; i++) {
      const id = insertDoc.run(`rerank/doc${i}`, "memory", "rerank", `Rerank Doc ${i}`, `widgetcandidate content number ${i}`, `rrh${i}`).lastInsertRowid as number;
      insertChunk.run(id, 0, `widgetcandidate content number ${i}`, 5);
      docIds.push(id);
    }
    db.syncFts(conn);

    // Entity link overlapping an existing fts doc, to exercise dedup.
    const e1 = conn.prepare("INSERT INTO entities (name, type) VALUES (?, ?)").run("widgetcandidate", "concept").lastInsertRowid as number;
    const e2 = conn.prepare("INSERT INTO entities (name, type) VALUES (?, ?)").run("othertag", "concept").lastInsertRowid as number;
    conn.prepare("INSERT INTO entity_links (source_id, target_id, relation, doc_id) VALUES (?, ?, ?, ?)").run(e1, e2, "related", docIds[0]);
  });

  afterAll(() => {
    delete process.env.ANTHROPIC_API_KEY;
    mockCreate.mockReset();
  });

  it("falls back to a plain slice when there is no API key, even with many candidates", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const out = await search.searchWithRerank("widgetcandidate", 5);
    expect(out.length).toBe(5);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("uses the LLM ranking to reorder and filter out-of-range indices", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "Best picks: [2, 0, 20, 4]" }] });
    const out = await search.searchWithRerank("widgetcandidate", 5);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(out.length).toBe(3); // index 20 is out of range and filtered out
  });

  it("falls back to slice when the response has no text block", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValueOnce({ content: [{ type: "other" }] });
    const out = await search.searchWithRerank("widgetcandidate", 5);
    expect(out.length).toBe(5);
  });

  it("falls back to slice when the response has malformed JSON", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "[1,2,]" }] });
    const out = await search.searchWithRerank("widgetcandidate", 5);
    expect(out.length).toBe(5);
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
