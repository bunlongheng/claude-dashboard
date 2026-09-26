import { NextResponse } from "next/server";
import { extractSessionInsights } from "@/lib/rag-extract-insights";
import { withErrorHandler } from "@/lib/api-handler";
import { requireSameSiteOrLocalTool } from "@/lib/route-guard";
export const dynamic = "force-dynamic";
export const POST = withErrorHandler(async (req: Request) => {
  const denied = requireSameSiteOrLocalTool(req);
  if (denied) return denied;
  const count = await extractSessionInsights(50);
  return NextResponse.json({ extracted: count });
});
