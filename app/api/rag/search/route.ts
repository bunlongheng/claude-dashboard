import { NextRequest, NextResponse } from "next/server";
import { ftsSearch, ftsSearchCompact } from "@/lib/rag-search";
import { getDb } from "@/lib/rag-db";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q?.trim()) return NextResponse.json({ error: "q required" }, { status: 400 });
  const compact = req.nextUrl.searchParams.get("compact") === "true";
  const results = compact ? ftsSearchCompact(q, 20) : ftsSearch(q, 20);
  const db = getDb();
  db.prepare("INSERT INTO search_log (query, results_count) VALUES (?, ?)").run(q.slice(0, 200), results.length);
  return NextResponse.json({ query: q, results });
}
