import { NextResponse } from "next/server";
import { extractSessionInsights } from "@/lib/rag-extract-insights";
export const dynamic = "force-dynamic";
export async function POST() {
  const count = await extractSessionInsights(50);
  return NextResponse.json({ extracted: count });
}
