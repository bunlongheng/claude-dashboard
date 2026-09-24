import { describe, it, expect, beforeAll, vi } from "vitest";
import * as os from "os";
import * as path from "path";

// Throwaway SQLite DB, set before rag-db is ever imported (RAG_DB_PATH is
// read at module import time), mirroring tests/unit/rag.test.ts.
const TMP_DB = path.join(os.tmpdir(), `eval-run-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.RAG_DB_PATH = TMP_DB;

const mockAssembleContext = vi.fn();
const mockAnswer = vi.fn();
const mockJudge = vi.fn();
const mockIndexChunks = vi.fn();

vi.mock("@/lib/eval/configs", () => ({
  assembleContext: mockAssembleContext,
}));
vi.mock("@/lib/eval/llm", () => ({
  answer: mockAnswer,
  judge: mockJudge,
}));
vi.mock("@/lib/eval/vectors", () => ({
  indexChunks: mockIndexChunks,
}));

type RunMod = typeof import("@/lib/eval/run");
type RagDb = typeof import("@/lib/rag-db");

let run: RunMod;
let db: RagDb;

function defaultMocks() {
  mockAssembleContext.mockResolvedValue({ context: "ctx", size: 3, chunks: 1 });
  mockAnswer.mockResolvedValue({
    text: "an answer",
    usage: { model: "claude-haiku-4-5-20251001", tokensIn: 10, tokensOut: 5, costUsd: 0.001, latencyMs: 50 },
  });
  mockJudge.mockResolvedValue({
    score: 4,
    reason: "good",
    usage: { model: "claude-haiku-4-5-20251001", tokensIn: 20, tokensOut: 8, costUsd: 0.002, latencyMs: 70 },
  });
  mockIndexChunks.mockResolvedValue({ embedded: 0, total: 0 });
}

beforeAll(async () => {
  run = await import("@/lib/eval/run");
  db = await import("@/lib/rag-db");
});

describe("lib/eval/run - getReport on an empty table", () => {
  it("returns batchId null and empty configs when eval_runs has no rows yet", () => {
    const report = run.getReport();
    expect(report).toEqual({ batchId: null, configs: [], questionCount: 0 });
  });

  it("echoes back an explicit batchId that matches nothing, with empty configs", () => {
    const report = run.getReport("no-such-batch");
    expect(report.batchId).toBe("no-such-batch");
    expect(report.configs).toEqual([]);
    expect(report.questionCount).toBe(0);
  });
});

describe("lib/eval/run - runBenchmark", () => {
  beforeAll(() => {
    const conn = db.getDb();
    const insertQ = conn.prepare("INSERT INTO eval_questions (question, expected, tags) VALUES (?, ?, ?)");
    insertQ.run("What port does the dashboard use?", "3003", "infra");
    insertQ.run("What db does rag use?", "sqlite", "rag");
  });

  it("does not index vectors when no config needs them", async () => {
    defaultMocks();
    mockIndexChunks.mockClear();
    const result = await run.runBenchmark({ configs: ["nothing"] });
    expect(mockIndexChunks).not.toHaveBeenCalled();
    expect(result.runs).toBeGreaterThan(0);
  });

  it("indexes vectors when rag_vector is among the configs", async () => {
    defaultMocks();
    mockIndexChunks.mockClear();
    await run.runBenchmark({ configs: ["rag_vector"] });
    expect(mockIndexChunks).toHaveBeenCalledTimes(1);
  });

  it("runs every question for every config when no questionIds filter is given", async () => {
    defaultMocks();
    const conn = db.getDb();
    const allQuestions = conn.prepare("SELECT id FROM eval_questions").all() as { id: number }[];
    const { batchId, runs } = await run.runBenchmark({ configs: ["nothing", "rag"] });
    expect(runs).toBe(allQuestions.length * 2);
    const rows = conn.prepare("SELECT DISTINCT question_id FROM eval_runs WHERE batch_id = ?").all(batchId) as { question_id: number }[];
    expect(rows.length).toBe(allQuestions.length);
  });

  it("restricts to the given questionIds when provided", async () => {
    defaultMocks();
    const conn = db.getDb();
    const [first] = conn.prepare("SELECT id FROM eval_questions ORDER BY id").all() as { id: number }[];
    const { batchId, runs } = await run.runBenchmark({ configs: ["nothing"], questionIds: [first.id] });
    expect(runs).toBe(1);
    const rows = conn.prepare("SELECT question_id FROM eval_runs WHERE batch_id = ?").all(batchId) as { question_id: number }[];
    expect(rows).toEqual([{ question_id: first.id }]);
  });

  it("uses the default EVAL_CONFIGS matrix when opts is omitted entirely", async () => {
    defaultMocks();
    mockIndexChunks.mockClear();
    const conn = db.getDb();
    const [first] = conn.prepare("SELECT id FROM eval_questions ORDER BY id").all() as { id: number }[];
    const { runs } = await run.runBenchmark({ questionIds: [first.id] });
    // EVAL_CONFIGS has 3 entries and includes rag_vector.
    expect(runs).toBe(3);
    expect(mockIndexChunks).toHaveBeenCalledTimes(1);
  });

  it("inserts a fully-populated eval_runs row combining answer + judge usage", async () => {
    mockAssembleContext.mockResolvedValue({ context: "ctx", size: 42, chunks: 1 });
    mockAnswer.mockResolvedValue({
      text: "the answer text",
      usage: { model: "claude-haiku-4-5-20251001", tokensIn: 10, tokensOut: 5, costUsd: 0.001, latencyMs: 50 },
    });
    mockJudge.mockResolvedValue({
      score: 5,
      reason: "correct",
      usage: { model: "claude-haiku-4-5-20251001", tokensIn: 20, tokensOut: 8, costUsd: 0.002, latencyMs: 70 },
    });
    mockIndexChunks.mockResolvedValue({ embedded: 0, total: 0 });

    const conn = db.getDb();
    const [first] = conn.prepare("SELECT id FROM eval_questions ORDER BY id").all() as { id: number }[];
    const { batchId } = await run.runBenchmark({ configs: ["rag"], questionIds: [first.id] });

    const row = conn.prepare("SELECT * FROM eval_runs WHERE batch_id = ?").get(batchId) as any;
    expect(row.config).toBe("rag");
    expect(row.question_id).toBe(first.id);
    expect(row.response).toBe("the answer text");
    expect(row.judge_score).toBe(5);
    expect(row.judge_reason).toBe("correct");
    expect(row.context_size).toBe(42);
    expect(row.model).toBe("claude-haiku-4-5-20251001");
    // Totals = answer usage + judge usage.
    expect(row.tokens_in).toBe(10 + 20);
    expect(row.tokens_out).toBe(5 + 8);
    expect(row.latency_ms).toBe(50 + 70);
    expect(row.cost_usd).toBeCloseTo(0.001 + 0.002, 6);
  });
});

describe("lib/eval/run - getReport", () => {
  it("aggregates per-config stats for an explicit batchId", async () => {
    defaultMocks();
    const conn = db.getDb();
    const [first] = conn.prepare("SELECT id FROM eval_questions ORDER BY id").all() as { id: number }[];
    const { batchId } = await run.runBenchmark({ configs: ["nothing", "rag"], questionIds: [first.id] });

    const report = run.getReport(batchId);
    expect(report.batchId).toBe(batchId);
    expect(report.questionCount).toBe(1);
    expect(report.configs.length).toBe(2);
    // Ordered per EVAL_CONFIGS: nothing before rag.
    expect(report.configs.map(c => c.config)).toEqual(["nothing", "rag"]);
    for (const c of report.configs) {
      expect(c.runs).toBe(1);
      expect(c.avgScore).toBe(4);
      expect(c.totalTokensIn).toBeGreaterThan(0);
    }
  });

  it("falls back to the latest batch when no batchId is given", async () => {
    defaultMocks();
    const conn = db.getDb();
    // Isolate from batches inserted by earlier tests so the DESC-by-created_at
    // tie-break can't accidentally pick one of them instead.
    conn.prepare("DELETE FROM eval_runs").run();
    const [first] = conn.prepare("SELECT id FROM eval_questions ORDER BY id").all() as { id: number }[];
    const { batchId: older } = await run.runBenchmark({ configs: ["nothing"], questionIds: [first.id] });
    // Force the "older" batch's created_at into the past so ordering is
    // deterministic even if both batches land in the same second.
    conn.prepare("UPDATE eval_runs SET created_at = '2000-01-01T00:00:00Z' WHERE batch_id = ?").run(older);
    const { batchId: latest } = await run.runBenchmark({ configs: ["nothing"], questionIds: [first.id] });

    const report = run.getReport();
    expect(report.batchId).toBe(latest);
  });

  it("falls back avgScore to 0 when every judge_score in a group is NULL", async () => {
    defaultMocks();
    const conn = db.getDb();
    const [first] = conn.prepare("SELECT id FROM eval_questions ORDER BY id").all() as { id: number }[];
    const nullBatch = "null-score-batch";
    conn.prepare(`
      INSERT INTO eval_runs
        (batch_id, question_id, config, response, judge_score, judge_reason,
         latency_ms, tokens_in, tokens_out, cost_usd, context_size, model)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
    `).run(nullBatch, first.id, "rag", "resp", "no score", 10, 1, 1, 0, 5, "m");

    const report = run.getReport(nullBatch);
    expect(report.configs.length).toBe(1);
    expect(report.configs[0].avgScore).toBe(0);
  });

  it("leaves rows from retired configs out of the report and the detail", async () => {
    // Batches from before the KP modes were removed still carry their rows.
    const conn = db.getDb();
    const [first] = conn.prepare("SELECT id FROM eval_questions ORDER BY id").all() as { id: number }[];
    const legacyBatch = "legacy-kp-batch";
    const insert = conn.prepare(`
      INSERT INTO eval_runs
        (batch_id, question_id, config, response, judge_score, judge_reason,
         latency_ms, tokens_in, tokens_out, cost_usd, context_size, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(legacyBatch, first.id, "kp", "resp", 1, "weak", 10, 1, 1, 0, 5, "m");
    insert.run(legacyBatch, first.id, "rag", "resp", 4, "good", 10, 1, 1, 0, 5, "m");

    const report = run.getReport(legacyBatch);
    expect(report.configs.map(c => c.config)).toEqual(["rag"]);
    expect(run.getBatchDetail(legacyBatch).map(r => r.config)).toEqual(["rag"]);
  });
});

describe("lib/eval/run - getBatchDetail", () => {
  it("returns one row per question/config joined with the question text", async () => {
    defaultMocks();
    const conn = db.getDb();
    const [first] = conn.prepare("SELECT id FROM eval_questions ORDER BY id").all() as { id: number }[];
    const { batchId } = await run.runBenchmark({ configs: ["nothing", "rag"], questionIds: [first.id] });

    const detail = run.getBatchDetail(batchId);
    expect(detail.length).toBe(2);
    expect(detail[0].question_id).toBe(first.id);
    expect(detail.map((d: any) => d.config)).toEqual(["nothing", "rag"]);
    expect(detail[0]).toHaveProperty("question");
    expect(detail[0]).toHaveProperty("expected");
    expect(detail[0]).toHaveProperty("response");
    expect(detail[0]).toHaveProperty("judge_score");
    expect(detail[0]).toHaveProperty("judge_reason");
  });
});
