import { NextRequest, NextResponse } from "next/server";
import { getChunksByIds } from "@/lib/rag-search";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") || "").split(",").map(Number).filter(n => !isNaN(n));
  return NextResponse.json(getChunksByIds(ids));
}
