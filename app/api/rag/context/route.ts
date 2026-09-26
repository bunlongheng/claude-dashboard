import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/rag-context";
import { withErrorHandler } from "@/lib/api-handler";
import { requireSameSiteOrLocalTool } from "@/lib/route-guard";
export const dynamic = "force-dynamic";
export const POST = withErrorHandler(async (req: NextRequest) => {
  const denied = requireSameSiteOrLocalTool(req);
  if (denied) return denied;
  const { prompt, project } = await req.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  const { context, meta } = await buildContext(prompt, project);
  return NextResponse.json({ context, meta });
});
