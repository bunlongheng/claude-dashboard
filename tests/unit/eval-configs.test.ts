import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as os from "os";
import * as path from "path";

// Point rag-db at a throwaway SQLite DB before it is ever imported (rag-db
// reads RAG_DB_PATH at module import time), mirroring tests/unit/rag.test.ts.
const TMP_DB = path.join(os.tmpdir(), `eval-configs-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.RAG_DB_PATH = TMP_DB;

const mockVectorSearch = vi.fn();

// configs.ts imports this via "./vectors"; mocking by the "@/" alias resolves
// to the same absolute module file.
vi.mock("@/lib/eval/vectors", () => ({
  vectorSearch: mockVectorSearch,
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
  });

  it("'nothing' returns an empty context", async () => {
    const result = await configs.assembleContext("nothing", "authentication");
    expect(result).toEqual({ context: "", size: 0, chunks: 0 });
  });

  it("'rag' returns formatted FTS hits and counts them", async () => {
    const result = await configs.assembleContext("rag", "authentication");
    expect(result.context).toContain("authentication oauth setup");
    expect(result.size).toBe(result.context.length);
    expect(result.chunks).toBe(3);
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
    expect(result.chunks).toBeLessThanOrEqual(6);
    expect(result.context.split("\n\n").length).toBe(result.chunks);
  });

  it("'rag_vector' handles vector hits shorter than FTS hits (the `!r` branch on the vector side)", async () => {
    mockVectorSearch.mockResolvedValueOnce([]);
    const result = await configs.assembleContext("rag_vector", "authentication oauth setup");
    expect(result.context).toContain("authentication oauth setup");
  });
});
