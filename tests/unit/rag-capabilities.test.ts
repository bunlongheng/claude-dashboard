import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The embeddings probe memoizes per process, so each test that cares about a
// different answer re-imports the module with a fresh registry.
async function load() {
    vi.resetModules();
    return import("@/lib/rag-capabilities");
}

const REAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    // Default to an accepted key so specs about the embedder isolate that alone.
    vi.doMock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: async () => ({ content: [] }) } } }));
});

afterEach(() => {
    if (REAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = REAL_KEY;
    vi.doUnmock("@huggingface/transformers");
    vi.doUnmock("@anthropic-ai/sdk");
});

// @huggingface/transformers is an optional dep and is not installed here, so the
// real import genuinely fails - the "missing" path needs no mock at all.
describe("embeddingsAvailable", () => {
    it("reports false when the optional package is absent", async () => {
        const cap = await load();
        await expect(cap.embeddingsAvailable()).resolves.toBe(false);
    });

    it("reports true when the package resolves", async () => {
        vi.doMock("@huggingface/transformers", () => ({ pipeline: async () => () => {} }));
        const cap = await load();
        await expect(cap.embeddingsAvailable()).resolves.toBe(true);
    });

    it("probes once and reuses the answer", async () => {
        const cap = await load();
        await expect(cap.embeddingsAvailable()).resolves.toBe(false);

        // Make the package resolvable after the first probe. A second import
        // would now succeed, so still answering false proves the cached result
        // came back rather than a fresh probe.
        vi.doMock("@huggingface/transformers", () => ({ pipeline: async () => () => {} }));
        await expect(cap.embeddingsAvailable()).resolves.toBe(false);
    });
});

describe("synthesisAvailable", () => {
    it("is false with no key, without spending a call", async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const create = vi.fn();
        vi.doMock("@anthropic-ai/sdk", () => ({ default: class { messages = { create } } }));
        const cap = await load();

        await expect(cap.synthesisAvailable()).resolves.toBe(false);
        expect(create).not.toHaveBeenCalled();
    });

    it("is true when the key is accepted", async () => {
        vi.doMock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: async () => ({ content: [] }) } } }));
        const cap = await load();
        await expect(cap.synthesisAvailable()).resolves.toBe(true);
    });

    // The state this install is actually in: the key is set and still rejected.
    it("is false when a present key is rejected", async () => {
        vi.doMock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: async () => { throw new Error("401 authentication_error"); } } } }));
        const cap = await load();
        await expect(cap.synthesisAvailable()).resolves.toBe(false);
    });

    it("probes once per process", async () => {
        const create = vi.fn(async () => ({ content: [] }));
        vi.doMock("@anthropic-ai/sdk", () => ({ default: class { messages = { create } } }));
        const cap = await load();

        await cap.synthesisAvailable();
        await cap.synthesisAvailable();
        expect(create).toHaveBeenCalledTimes(1);
    });
});

describe("modeStatuses", () => {
    it("keeps the key-free modes available with no embedder and no key", async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const cap = await load();
        const byKey = Object.fromEntries((await cap.modeStatuses()).map(s => [s.key, s]));

        expect(byKey.nothing.available).toBe(true);
        expect(byKey.rag.available).toBe(true);
    });

    it("blocks the vector modes on the missing embedder before the key", async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const cap = await load();
        const byKey = Object.fromEntries((await cap.modeStatuses()).map(s => [s.key, s]));

        expect(byKey.rag_vector).toMatchObject({ available: false, reason: "needs @huggingface/transformers" });
        // rag_vector_kp is missing both - the embedder is the nearer cause.
        expect(byKey.rag_vector_kp).toMatchObject({ available: false, reason: "needs @huggingface/transformers" });
    });

    it("blocks the synthesis modes on the key alone", async () => {
        vi.doMock("@huggingface/transformers", () => ({ pipeline: async () => () => {} }));
        delete process.env.ANTHROPIC_API_KEY;
        const cap = await load();
        const byKey = Object.fromEntries((await cap.modeStatuses()).map(s => [s.key, s]));

        expect(byKey.rag_vector.available).toBe(true);
        expect(byKey.kp).toMatchObject({ available: false, reason: "ANTHROPIC_API_KEY missing or rejected" });
        expect(byKey.rag_vector_kp).toMatchObject({ available: false, reason: "ANTHROPIC_API_KEY missing or rejected" });
    });

    it("reports every mode available when both dependencies are there", async () => {
        vi.doMock("@huggingface/transformers", () => ({ pipeline: async () => () => {} }));
        const cap = await load();
        const statuses = await cap.modeStatuses();

        expect(statuses).toHaveLength(5);
        expect(statuses.every(s => s.available)).toBe(true);
        expect(statuses.every(s => s.reason === undefined)).toBe(true);
    });
});

describe("resolveMode", () => {
    it("falls back to plain retrieval when nothing is stored", async () => {
        const cap = await load();
        await expect(cap.resolveMode(null)).resolves.toEqual({ mode: "rag" });
    });

    it("passes a runnable mode straight through", async () => {
        const cap = await load();
        await expect(cap.resolveMode("rag")).resolves.toEqual({ mode: "rag" });
        await expect(cap.resolveMode("nothing")).resolves.toEqual({ mode: "nothing" });
    });

    it("degrades an unrunnable mode and says what it degraded from", async () => {
        const cap = await load();
        await expect(cap.resolveMode("rag_vector")).resolves.toEqual({
            mode: "rag",
            fallbackFrom: "rag_vector",
            reason: "needs @huggingface/transformers",
        });
    });

    it("degrades a mode that is no longer in the catalog", async () => {
        const cap = await load();
        // A value left in app_settings by an older build.
        await expect(cap.resolveMode("hybrid_v2" as never)).resolves.toEqual({
            mode: "rag",
            fallbackFrom: "hybrid_v2",
            reason: "unknown mode",
        });
    });

    it("never degrades into a mode that is itself unavailable", async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const cap = await load();
        const statuses = await cap.modeStatuses();
        const fallback = statuses.find(s => s.key === cap.FALLBACK_MODE);

        expect(fallback?.available).toBe(true);
    });
});
