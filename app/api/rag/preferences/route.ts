import { NextResponse } from "next/server";
import { getDb } from "@/lib/rag-db";
export const dynamic = "force-dynamic";
export async function GET() {
  const db = getDb();
  const prefs = db.prepare("SELECT * FROM preferences ORDER BY category, key").all();
  return NextResponse.json(prefs);
}
