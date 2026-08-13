import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as os from "os";
import * as path from "path";

// Point rag-db at a throwaway SQLite DB before it is ever imported (rag-db
// reads RAG_DB_PATH at module import time), mirroring tests/unit/rag.test.ts.
const TMP_DB = path.join(os.tmpdir(), `eval-configs-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.RAG_DB_PATH = TMP_DB;

const mockVectorSearch = vi.fn();
const mockKpSynthesize = vi.fn();

// configs.ts imports these via "./vectors" and "./llm"; mocking by the "@/"
// alias resolves to the same absolute module files.
vi.mock("@/lib/eval/vectors", () => ({
  vectorSearch: mockVectorSearch,
}));
vi.mock("@/lib/eval/llm", () => ({
  kpSynthesize: mockKpSynthesize,
}));

type ConfigsMod = typeof import("@/lib/eval/configs");
type RagDb = typeof import("@/lib/rag-db");

let configs: ConfigsMod;
let db: RagDb;
let authChunkIds: number[];

beforeAll(async () => {
  configs = await import("@/lib/eval/configs");
  db = await import("@/lib/rag-db");

  const conn = db.getDb();

  const insertDoc = conn.prepare(
    "INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const d1 = insertDoc.run("p/auth1", "memory", "claude", "Auth One", "authentication oauth setup one", "h1").lastInsertRowid as number;
  const d2 = insertDoc.run("p/auth2", "memory", "claude", "Auth Two", "authentication oauth setup two", "h2").lastInsertRowid as number;
  const d3 = insertDoc.run("p/auth3", "memory", "claude", "Auth Three", "authentication oauth setup three", "h3").lastInsertRowid as number;
  insertDoc.run("p/wiki1", "global_rules", "claude", "Wiki Rule", "always use hyphens not dashes", "h4");
  insertDoc.run("p/wiki2", "claude_md", "claude", "Wiki Md", "port 3003 for the claude dashboard", "h5");
  // Not a memory/global_rules/claude_md doc - must be excluded from wikiCorpus.
  insertDoc.run("p/convo", "conversation", "claude", "Convo", "chit chat not part of the wiki", "h6");

  const insertChunk = conn.prepare("INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)");
  const c1 = insertChunk.run(d1, 0, "authentication oauth setup one detail", 6).lastInsertRowid as number;
  const c2 = insertChunk.run(d2, 0, "authentication oauth setup two detail", 6).lastInsertRowid as number;
  const c3 = insertChunk.run(d3, 0, "authentication oauth setup three detail", 6).lastInsertRowid as number;
  authChunkIds = [c1, c2, c3];

  db.syncFts(conn);
});

describe("lib/eval/configs - assembleContext branches", () => {
  beforeEach(() => {
    mockVectorSearch.mockClear();
    mockKpSynthesize.mockClear();
  });

  it("'nothing' returns empty context with no usage", async () => {
    const result = await configs.assembleContext("nothing", "authentication");
    expect(result).toEqual({ context: "", size: 0, extraUsage: [] });
  });

  it("'rag' returns formatted FTS hits and no extra usage", async () => {
    const result = await configs.assembleContext("rag", "authentication");
    expect(result.context).toContain("authentication oauth setup");
    expect(result.size).toBe(result.context.length);
    expect(result.extraUsage).toEqual([]);
  });

  it("'rag' sanitizes FTS-special characters out of the question (sanitizeForFts)", async () => {
    const messy = `What's the "auth" setup - oauth?`;
    const result = await configs.assembleContext("rag", messy);
    expect(result.context).toContain("authentication oauth setup");
  });

  it("'rag_vector' merges FTS and vector hits, deduping by chunk id and capping at 6", async () => {
    // Real FTS hits for this query (captured directly to build a deterministic mock).
    const search = await import("@/lib/rag-search");
    const ftsHits = search.ftsSearch("authentication oauth setup", 6);
    expect(ftsHits.length).toBeGreaterThan(0);

    // Vector mock: index 0 duplicates the first FTS hit's chunk_id (exercises the
    // `seen.has` dedup branch); remaining entries are brand-new ids, and the vector
    // array is longer than the FTS array (exercises the `!r` branch on the FTS side
    // once FTS is exhausted).
    const vecHits = [
      { id: ftsHits[0].chunk_id, doc_id: 1, content: "dup of fts[0]", project: "claude", source_type: "memory", title: "dup", score: 0.9 },
      { id: 9001, doc_id: 1, content: "vector only one", project: "claude", source_type: "memory", title: "v1", score: 0.8 },
      { id: 9002, doc_id: 1, content: "vector only two", project: "claude", source_type: "memory", title: "v2", score: 0.7 },
      { id: 9003, doc_id: 1, content: "vector only three", project: "claude", source_type: "memory", title: "v3", score: 0.6 },
      { id: 9004, doc_id: 1, content: "vector only four", project: "claude", source_type: "memory", title: "v4", score: 0.5 },
      { id: 9005, doc_id: 1, content: "vector only five", project: "claude", source_type: "memory", title: "v5", score: 0.4 },
    ];
    mockVectorSearch.mockResolvedValueOnce(vecHits);

    const result = await configs.assembleContext("rag_vector", "authentication oauth setup");
    expect(mockVectorSearch).toHaveBeenCalledWith("authentication oauth setup", 6);
    // The vector duplicate of fts[0]'s chunk id must be dropped (seen.has branch);
    // the FTS version (added first) wins and its own content is present instead.
    expect(result.context).not.toContain("dup of fts[0]");
    expect(result.context).toContain("vector only one");
    // Capped at 6 total merged hits.
    const entryCount = result.context.split("\n\n").length;
    expect(entryCount).toBeLessThanOrEqual(6);
    expect(result.extraUsage).toEqual([]);
  });

  it("'rag_vector' handles vector hits shorter than FTS hits (the `!r` branch on the vector side)", async () => {
    mockVectorSearch.mockResolvedValueOnce([]);
    const result = await configs.assembleContext("rag_vector", "authentication oauth setup");
    expect(result.context).toContain("authentication oauth setup");
  });

  it("'rag_vector_kp' synthesizes a brief from the merged hits", async () => {
    mockVectorSearch.mockResolvedValueOnce([]);
    mockKpSynthesize.mockResolvedValueOnce({
      brief: "tight brief",
      usage: { model: "m", tokensIn: 1, tokensOut: 1, costUsd: 0, latencyMs: 0 },
    });
    const result = await configs.assembleContext("rag_vector_kp", "authentication oauth setup");
    expect(result.context).toBe("tight brief");
    expect(result.size).toBe("tight brief".length);
    expect(result.extraUsage).toEqual([{ model: "m", tokensIn: 1, tokensOut: 1, costUsd: 0, latencyMs: 0 }]);
    const rawPassed = mockKpSynthesize.mock.calls[0][1] as string;
    expect(rawPassed).toContain("authentication oauth setup");
  });

  it("'kp' synthesizes over the full wiki corpus, including preferences when present", async () => {
    const conn = db.getDb();
    conn.prepare("INSERT INTO preferences (category, key, value) VALUES (?, ?, ?)").run("stack", "framework", "Next.js 16");

    mockKpSynthesize.mockResolvedValueOnce({
      brief: "wiki brief",
      usage: { model: "m", tokensIn: 2, tokensOut: 2, costUsd: 0, latencyMs: 0 },
    });
    const result = await configs.assembleContext("kp", "anything");
    expect(result.context).toBe("wiki brief");
    expect(mockVectorSearch).not.toHaveBeenCalled();

    const rawPassed = mockKpSynthesize.mock.calls[0][1] as string;
    expect(rawPassed).toContain("PREFERENCES:");
    expect(rawPassed).toContain("framework: Next.js 16");
    expect(rawPassed).toContain("always use hyphens not dashes");
    expect(rawPassed).toContain("port 3003 for the claude dashboard");
    // Only memory/global_rules/claude_md docs are included, not conversation docs.
    expect(rawPassed).not.toContain("chit chat not part of the wiki");
  });

  it("'kp' omits the PREFERENCES block when there are no preference rows", async () => {
    const conn = db.getDb();
    conn.prepare("DELETE FROM preferences").run();

    mockKpSynthesize.mockResolvedValueOnce({
      brief: "wiki brief no prefs",
      usage: { model: "m", tokensIn: 1, tokensOut: 1, costUsd: 0, latencyMs: 0 },
    });
    await configs.assembleContext("kp", "anything");
    const rawPassed = mockKpSynthesize.mock.calls[0][1] as string;
    expect(rawPassed).not.toContain("PREFERENCES:");
  });

  it("'kp' caps the wiki corpus at EVAL_WIKI_MAX_CHARS", async () => {
    const prev = process.env.EVAL_WIKI_MAX_CHARS;
    process.env.EVAL_WIKI_MAX_CHARS = "20";
    try {
      mockKpSynthesize.mockResolvedValueOnce({
        brief: "capped",
        usage: { model: "m", tokensIn: 1, tokensOut: 1, costUsd: 0, latencyMs: 0 },
      });
      await configs.assembleContext("kp", "anything");
      const rawPassed = mockKpSynthesize.mock.calls[0][1] as string;
      expect(rawPassed.length).toBeLessThanOrEqual(20);
    } finally {
      if (prev === undefined) delete process.env.EVAL_WIKI_MAX_CHARS;
      else process.env.EVAL_WIKI_MAX_CHARS = prev;
    }
  });
});
