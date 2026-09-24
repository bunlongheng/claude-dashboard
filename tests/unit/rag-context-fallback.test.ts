import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

// Own throwaway DB, same pattern as the other rag suites.
const TMP_DB = path.join(os.tmpdir(), `rag-fallback-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.RAG_DB_PATH = TMP_DB;
process.env.ANTHROPIC_API_KEY = "sk-test";

// The capability probe spends one tiny call to check the key. Let that succeed,
// then fail everything after it - that is the gap the static probe cannot see:
// a mode that answers "available" and still breaks once it actually runs.
let calls = 0;
vi.mock("@anthropic-ai/sdk", () => ({
    default: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        this.messages = {
            create: async () => {
                calls++;
                if (calls === 1) return { content: [] }; // the probe
                throw new Error("401 authentication_error");
            },
        };
    }),
}));

type RagDb = typeof import("@/lib/rag-db");
type RagContext = typeof import("@/lib/rag-context");

let db: RagDb;
let context: RagContext;

beforeAll(async () => {
    db = await import("@/lib/rag-db");
    context = await import("@/lib/rag-context");
    const d = db.getDb();

    // kpSynthesize short-circuits on an empty corpus and never calls the API,
    // so the failure path needs something to synthesize over.
    d.prepare("INSERT INTO preferences (category, key, value) VALUES (?, ?, ?)")
        .run("git", "attribution", "author is always Bunlong Heng");
});

afterAll(() => {
    delete process.env.ANTHROPIC_API_KEY;
    fs.rmSync(TMP_DB, { force: true });
});

describe("buildContext: runtime degradation", () => {
    it("falls back when an available mode fails mid-assembly", async () => {
        // kp probes available (the key was accepted) and then 401s on the real
        // synthesis call. The session should lose the synthesis, not its memory.
        db.setSetting("memory_mode", "kp");
        const { meta } = await context.buildContext("how does the router pick a tier", "claude");

        expect(meta.mode).toBe("rag");
        expect(meta.fallbackFrom).toBe("kp");
        expect(meta.reason).toMatch(/401/);
    });

    it("still logs the request after degrading", async () => {
        const before = db.getDb().prepare("SELECT COUNT(*) c FROM context_log").get() as { c: number };
        await context.buildContext("another prompt", "claude");
        const after = db.getDb().prepare("SELECT COUNT(*) c FROM context_log").get() as { c: number };

        expect(after.c).toBe(before.c + 1);
    });

    it("lets a failure in the fallback mode itself surface", async () => {
        // Nothing should swallow a broken FTS index - that is not a missing
        // enrichment layer, it is the retrieval floor giving way.
        db.setSetting("memory_mode", "rag");
        db.getDb().exec("DROP TABLE chunks_fts");

        await expect(context.buildContext("anything", "claude")).rejects.toThrow();
    });
});
