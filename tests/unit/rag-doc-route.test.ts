import { describe, it, expect, vi, beforeEach } from "vitest";
import * as os from "os";
import * as path from "path";
import { NextRequest } from "next/server";

// Behavioral tests for app/api/rag/docs/[id]/route.ts against a throwaway
// RAG_DB_PATH (read at import time by lib/rag-db.ts, hence resetModules).

const savedPath = process.env.RAG_DB_PATH;

beforeEach(() => {
  process.env.RAG_DB_PATH = path.join(os.tmpdir(), `rag-doc-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  vi.resetModules();
  return () => {
    if (savedPath === undefined) delete process.env.RAG_DB_PATH;
    else process.env.RAG_DB_PATH = savedPath;
  };
});

async function get(id: string) {
  const { GET } = await import("@/app/api/rag/docs/[id]/route");
  return GET(new NextRequest(`http://localhost/api/rag/docs/${id}`), { params: Promise.resolve({ id }) });
}

describe("GET /api/rag/docs/[id]", () => {
  it("returns 404 for an unknown document", async () => {
    const res = await get("999");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns the document with its chunks in index order", async () => {
    const { getDb } = await import("@/lib/rag-db");
    const db = getDb();
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("/tmp/doc1.md", "memory", "demoapp", "Doc One", "a b", "h1");
    const ins = db.prepare("INSERT INTO chunks (doc_id, chunk_index, content) VALUES (?, ?, ?)");
    ins.run(lastInsertRowid, 1, "second");
    ins.run(lastInsertRowid, 0, "first");

    const res = await get(String(lastInsertRowid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: Number(lastInsertRowid), title: "Doc One", project: "demoapp" });
    expect(body.chunks.map((c: { content: string }) => c.content)).toEqual(["first", "second"]);
  });
});
