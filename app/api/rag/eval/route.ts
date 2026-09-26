import { NextRequest, NextResponse } from "next/server";
import { runBenchmark, getReport, getBatchDetail } from "@/lib/eval/run";
import { withErrorHandler } from "@/lib/api-handler";
import { requireSameSite } from "@/lib/route-guard";
import type { EvalConfig } from "@/lib/rag-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/rag/eval            -> latest batch report
// GET /api/rag/eval?batch=ID   -> that batch report
// GET /api/rag/eval?batch=ID&detail=1 -> per-question detail
export const GET = withErrorHandler(async (req: NextRequest) => {
  const batch = req.nextUrl.searchParams.get("batch") || undefined;
  const detail = req.nextUrl.searchParams.get("detail");
  if (detail && batch) {
    return NextResponse.json({ batchId: batch, rows: getBatchDetail(batch) });
  }
  return NextResponse.json(getReport(batch));
});

// POST /api/rag/eval -> run the full 5-config matrix over all questions
export const POST = withErrorHandler(async (req: NextRequest) => {
  const denied = requireSameSite(req);
  if (denied) return denied;
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 400 });
  }
  let body: { configs?: EvalConfig[]; questionIds?: number[] } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const result = await runBenchmark({
    configs: body.configs,
    questionIds: body.questionIds,
  });
  return NextResponse.json({ ...result, report: getReport(result.batchId) });
});
