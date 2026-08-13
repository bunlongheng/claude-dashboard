import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/rag-db";
import { withErrorHandler } from "@/lib/api-handler";
export const dynamic = "force-dynamic";
export const GET = withErrorHandler(async (req: NextRequest) => {
  const db = getDb();
  const slim = req.nextUrl.searchParams.get("slim") === "1";
  const cols = slim
    ? "id, category, key, confidence, created_at"
    : "*";
  const prefs = db.prepare(`SELECT ${cols} FROM preferences ORDER BY category, key`).all();
  return NextResponse.json(prefs);
});
