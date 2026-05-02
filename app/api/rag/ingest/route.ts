import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/rag-ingest";
import { ingestSessions } from "@/lib/rag-ingest-sessions";
export const dynamic = "force-dynamic";
export async function POST() {
  const memory = await ingestAll();
  const sessions = await ingestSessions();
  return NextResponse.json({ memory, sessions });
}
