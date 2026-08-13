import crypto from "crypto";
import { getDb, EVAL_CONFIGS, type EvalConfig, type EvalQuestion } from "../rag-db";
import { assembleContext } from "./configs";
import { answer, judge, type Usage } from "./llm";
import { indexChunks } from "./vectors";

export type RunProgress = { batchId: string; total: number; done: number };

function sumUsage(parts: Usage[]): { tokensIn: number; tokensOut: number; costUsd: number; latencyMs: number } {
  return parts.reduce(
    (acc, u) => ({
      tokensIn: acc.tokensIn + u.tokensIn,
      tokensOut: acc.tokensOut + u.tokensOut,
      costUsd: acc.costUsd + u.costUsd,
      latencyMs: acc.latencyMs + u.latencyMs,
    }),
    { tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0 }
  );
}

// Run the full matrix: every question x every config. Returns the batch id.
export async function runBenchmark(opts?: { configs?: EvalConfig[]; questionIds?: number[] }): Promise<{ batchId: string; runs: number }> {
  const db = getDb();
  const batchId = crypto.randomUUID();
  const configs = opts?.configs ?? EVAL_CONFIGS;

  // Ensure vectors exist if any config needs them.
  if (configs.some(c => c === "rag_vector" || c === "rag_vector_kp")) {
    await indexChunks();
  }

  let questions: EvalQuestion[];
  if (opts?.questionIds?.length) {
    const ph = opts.questionIds.map(() => "?").join(",");
    questions = db.prepare(`SELECT * FROM eval_questions WHERE id IN (${ph})`).all(...opts.questionIds) as EvalQuestion[];
  } else {
    questions = db.prepare("SELECT * FROM eval_questions ORDER BY id").all() as EvalQuestion[];
  }

  const insert = db.prepare(`
    INSERT INTO eval_runs
      (batch_id, question_id, config, response, judge_score, judge_reason,
       latency_ms, tokens_in, tokens_out, cost_usd, context_size, model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let runs = 0;
  for (const q of questions) {
    for (const config of configs) {
      const asm = await assembleContext(config, q.question);
      const ans = await answer(q.question, asm.context);
      const grade = await judge(q.question, q.expected, ans.text);

      // Total cost/tokens = assembly (KP synth) + answering + judging.
      const totals = sumUsage([...asm.extraUsage, ans.usage, grade.usage]);

      insert.run(
        batchId, q.id, config, ans.text, grade.score, grade.reason,
        totals.latencyMs, totals.tokensIn, totals.tokensOut, totals.costUsd,
        asm.size, ans.usage.model
      );
      runs++;
    }
  }

  return { batchId, runs };
}

export type ConfigReport = {
  config: EvalConfig;
  runs: number;
  avgScore: number;
  avgLatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: number;
  avgContextSize: number;
};

interface ConfigAggRow {
  config: EvalConfig;
  runs: number;
  avgScore: number | null;
  avgLatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: number;
  avgContextSize: number;
}

interface BatchDetailRow {
  question_id: number;
  question: string;
  expected: string;
  config: EvalConfig;
  response: string;
  judge_score: number | null;
  judge_reason: string;
}

// Aggregate a batch (or the latest) into per-config rows for the report UI.
export function getReport(batchId?: string): { batchId: string | null; configs: ConfigReport[]; questionCount: number } {
  const db = getDb();
  const bid = batchId ?? (db.prepare("SELECT batch_id FROM eval_runs ORDER BY created_at DESC LIMIT 1").get() as { batch_id: string } | undefined)?.batch_id;
  if (!bid) return { batchId: null, configs: [], questionCount: 0 };

  const configs = db.prepare(`
    SELECT
      config,
      COUNT(*) as runs,
      AVG(judge_score) as avgScore,
      AVG(latency_ms) as avgLatencyMs,
      SUM(tokens_in) as totalTokensIn,
      SUM(tokens_out) as totalTokensOut,
      SUM(cost_usd) as totalCostUsd,
      AVG(context_size) as avgContextSize
    FROM eval_runs WHERE batch_id = ?
    GROUP BY config
  `).all(bid) as ConfigAggRow[];

  const questionCount = (db.prepare("SELECT COUNT(DISTINCT question_id) as c FROM eval_runs WHERE batch_id = ?").get(bid) as { c: number }).c;

  const order = EVAL_CONFIGS;
  configs.sort((a, b) => order.indexOf(a.config) - order.indexOf(b.config));

  return {
    batchId: bid,
    questionCount,
    configs: configs.map(c => ({
      config: c.config,
      runs: c.runs,
      // judge_score is nullable; the other columns are NOT NULL, so their
      // SUM/AVG can never be null for a group that exists.
      avgScore: c.avgScore ?? 0,
      avgLatencyMs: c.avgLatencyMs,
      totalTokensIn: c.totalTokensIn,
      totalTokensOut: c.totalTokensOut,
      totalCostUsd: c.totalCostUsd,
      avgContextSize: c.avgContextSize,
    })),
  };
}

// Per-question detail for a batch: one row per question with each config's score/response.
export function getBatchDetail(batchId: string) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT r.question_id, q.question, q.expected, r.config, r.response, r.judge_score, r.judge_reason
    FROM eval_runs r JOIN eval_questions q ON q.id = r.question_id
    WHERE r.batch_id = ? ORDER BY r.question_id, r.config
  `).all(batchId) as BatchDetailRow[];
  return rows;
}
