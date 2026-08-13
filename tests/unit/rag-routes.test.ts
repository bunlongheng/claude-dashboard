import { describe, it, expect, vi, beforeAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Behavioral tests for /api/qr, /api/rag/stats, and /api/rag/health. Follows the
// isolated-throwaway-db pattern from tests/unit/rag-search-extra.test.ts
// (RAG_DB_PATH env var, read at import time by lib/rag-db.ts). vi.resetModules()
// per test isolates each route's module-level state (e.g. statsCache in
// rag/stats) from the others.

// ─── /api/qr ──────────────────────────────────────────────────────────────────

describe("GET /api/qr", () => {
  it("returns an SVG QR code image for a given url param", async () => {
    const { GET } = await import("@/app/api/qr/route");
    const req = { nextUrl: new URL("http://localhost/api/qr?url=https://example.com") } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    const body = await res.text();
    expect(body).toContain("<svg");
  });

  it("returns 400 when the url param is missing", async () => {
    const { GET } = await import("@/app/api/qr/route");
    const req = { nextUrl: new URL("http://localhost/api/qr") } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Missing/);
  });
});

// ─── /api/rag/stats and /api/rag/health ──────────────────────────────────────

describe("GET /api/rag/stats and /api/rag/health", () => {
  async function freshDb(): Promise<string> {
    const dbPath = path.join(os.tmpdir(), `rag-routes-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    process.env.RAG_DB_PATH = dbPath;
    vi.resetModules();
    return dbPath;
  }

  it("rag/stats returns zeroed counts against a fresh empty db", async () => {
    await freshDb();
    const { GET } = await import("@/app/api/rag/stats/route");
    const res = await GET(new Request("http://localhost/"), {});
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ documents: 0, chunks: 0, preferences: 0, searches: 0, projects: 0 });
    expect(Array.isArray(data.searchBenchmark)).toBe(true);
    expect(data.searchBenchmark.length).toBe(10);
  });

  it("rag/stats reflects a seeded document in its counts", async () => {
    await freshDb();
    const dbMod = await import("@/lib/rag-db");
    const db = dbMod.getDb();
    db.prepare(
      `INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)`
    ).run("/tmp/doc1.md", "memory", "demoapp", "Doc One", "some content", "hash1");

    const { GET } = await import("@/app/api/rag/stats/route");
    const res = await GET(new Request("http://localhost/"), {});
    const data = await res.json();
    expect(data.documents).toBe(1);
    expect(data.projectCounts).toContainEqual({ project: "demoapp", count: 1 });
  });

  it("rag/health reports all_clear when the db has no issues", async () => {
    await freshDb();
    const { GET } = await import("@/app/api/rag/health/route");
    const res = await GET(new Request("http://localhost/"), {});
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toContainEqual(
      expect.objectContaining({ check_type: "all_clear", severity: "success" })
    );
  });

  it("rag/health flags an empty-value preference instead of all_clear", async () => {
    await freshDb();
    const dbMod = await import("@/lib/rag-db");
    const db = dbMod.getDb();
    db.prepare(
      `INSERT INTO preferences (category, key, value) VALUES (?, ?, ?)`
    ).run("workflow", "some-key", "");

    const { GET } = await import("@/app/api/rag/health/route");
    const res = await GET(new Request("http://localhost/"), {});
    const data = await res.json();
    const empty = data.find((c: { check_type: string }) => c.check_type === "empty_preferences");
    expect(empty).toBeTruthy();
    expect(empty.message).toMatch(/1 preferences have empty values/);
  });
});
