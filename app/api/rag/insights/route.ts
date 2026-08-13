import { NextResponse } from "next/server";
import { extractSessionInsights } from "@/lib/rag-extract-insights";
import { withErrorHandler } from "@/lib/api-handler";
export const dynamic = "force-dynamic";
export const POST = withErrorHandler(async () => {
  const count = await extractSessionInsights(50);
  return NextResponse.json({ extracted: count });
});
