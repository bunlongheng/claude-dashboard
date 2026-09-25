import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/rag-ingest";
import { ingestSessions } from "@/lib/rag-ingest-sessions";
import { withErrorHandler } from "@/lib/api-handler";
import { requireSameSiteOrLocalTool } from "@/lib/route-guard";
export const dynamic = "force-dynamic";
export const POST = withErrorHandler(async (req: Request) => {
  const denied = requireSameSiteOrLocalTool(req);
  if (denied) return denied;
  const memory = await ingestAll();
  const sessions = await ingestSessions();
  return NextResponse.json({ memory, sessions });
});
