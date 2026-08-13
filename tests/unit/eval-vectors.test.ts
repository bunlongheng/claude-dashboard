import { describe, it, expect, beforeAll, vi } from "vitest";
import * as os from "os";
import * as path from "path";

const TMP_DB = path.join(os.tmpdir(), `rag-vectors-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.RAG_DB_PATH = TMP_DB;

const { fakeVector } = vi.hoisted(() => {
  function fakeVector(text: string): Float32Array {
    let a = 0;
    let b = 0;
    let c = 0;
    let d = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      a += code;
      b += code * (i + 1);
      c += code % 7;
      d += (code % 3) * 2;
    }
    return new Float32Array([a, b, c, d]);
  }
  return { fakeVector };
});

vi.mock("@/lib/eval/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/eval/embeddings")>();
  return {
    ...actual,
    embed: vi.fn(async (text: string) => fakeVector(text)),
    embedBatch: vi.fn(async (texts: string[]) => texts.map(fakeVector)),
  };
});

type RagDb = typeof import("@/lib/rag-db");
type Vectors = typeof import("@/lib/eval/vectors");
type Embeddings = typeof import("@/lib/eval/embeddings");

let db: RagDb;
let vectors: Vectors;
let embeddings: Embeddings;

beforeAll(async () => {
  db = await import("@/lib/rag-db");
  vectors = await import("@/lib/eval/vectors");
  embeddings = await import("@/lib/eval/embeddings");
});

function insertDoc(sourcePath: string, content: string) {
  const conn = db.getDb();
  return conn
    .prepare(
      "INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(sourcePath, "memory", "claude", "Doc", content, sourcePath).lastInsertRowid as number;
}

function insertChunk(docId: number, index: number, content: string) {
  const conn = db.getDb();
  return conn
    .prepare("INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)")
    .run(docId, index, content, 3).lastInsertRowid as number;
}

function wipe() {
  const conn = db.getDb();
  conn.exec("DELETE FROM chunk_vectors; DELETE FROM chunks; DELETE FROM documents;");
}

describe("eval/vectors", () => {
  it("indexChunks returns embedded=0 and total=0 when nothing is missing", async () => {
    wipe();
    const result = await vectors.indexChunks();
    expect(result).toEqual({ embedded: 0, total: 0 });
  });

  it("indexChunks embeds missing chunks and vectorCount reflects it", async () => {
    wipe();
    const d1 = insertDoc("p/one", "content one");
    insertChunk(d1, 0, "alpha content chunk");
    insertChunk(d1, 1, "beta content chunk");

    const result = await vectors.indexChunks();
    expect(result.embedded).toBe(2);
    expect(result.total).toBe(2);
    expect(vectors.vectorCount()).toBe(2);

    const again = await vectors.indexChunks();
    expect(again).toEqual({ embedded: 0, total: 2 });
  });

  it("indexChunks processes more than one batch of 64", async () => {
    wipe();
    const d2 = insertDoc("p/batch", "batch doc");
    for (let i = 0; i < 70; i++) {
      insertChunk(d2, i, `batch chunk number ${i}`);
    }
    const result = await vectors.indexChunks();
    expect(result.embedded).toBe(70);
    expect(result.total).toBe(70);
    expect(vectors.vectorCount()).toBe(70);
  });

  it("vectorSearch scores by cosine similarity, sorts, and respects limit", async () => {
    wipe();
    const d3 = insertDoc("p/search", "search content");
    const contents = ["search target text alpha", "search target text beta", "search target text gamma"];
    contents.forEach((c, i) => insertChunk(d3, i, c));
    await vectors.indexChunks();

    const query = "search target text alpha";
    const results = await vectors.vectorSearch(query, 2);
    expect(results.length).toBe(2);

    const qv = fakeVector(query);
    const expectedScores = contents
      .map((c) => embeddings.cosine(qv, fakeVector(c)))
      .sort((a, b) => b - a);
    expect(results[0].score).toBeCloseTo(expectedScores[0], 5);
    expect(results[1].score).toBeCloseTo(expectedScores[1], 5);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    expect(results[0]).toHaveProperty("project", "claude");
    expect(results[0]).toHaveProperty("title", "Doc");
  });

  it("vectorSearch defaults to a limit of 5", async () => {
    const results = await vectors.vectorSearch("search target text alpha");
    expect(results.length).toBe(3);
  });

  it("vectorCount returns 0 for an empty table", () => {
    wipe();
    expect(vectors.vectorCount()).toBe(0);
  });
});
