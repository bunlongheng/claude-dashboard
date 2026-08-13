import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/rag-ingest";
import { ingestSessions } from "@/lib/rag-ingest-sessions";
import { withErrorHandler } from "@/lib/api-handler";
export const dynamic = "force-dynamic";
export const POST = withErrorHandler(async () => {
  const memory = await ingestAll();
  const sessions = await ingestSessions();
  return NextResponse.json({ memory, sessions });
});
