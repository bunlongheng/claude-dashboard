import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting, EVAL_CONFIGS, type EvalConfig } from "@/lib/rag-db";
import { modeStatuses } from "@/lib/rag-capabilities";
import { withErrorHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

// `modes` says which of them this install can actually run. The picker offers
// only those, so a mode cannot be selected into a 500, and the hidden ones come
// back on their own once the missing dependency is there.
export const GET = withErrorHandler(async () => {
  return NextResponse.json({ mode: getSetting("memory_mode"), modes: await modeStatuses() });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { mode } = await req.json();
  if (mode !== null && !EVAL_CONFIGS.includes(mode as EvalConfig)) {
    return NextResponse.json({ error: "invalid mode" }, { status: 400 });
  }
  setSetting("memory_mode", mode ?? "");
  return NextResponse.json({ ok: true, mode: getSetting("memory_mode") || null });
});
