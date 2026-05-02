import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/rag-context";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const { prompt, project } = await req.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  const context = await buildContext(prompt, project);
  return NextResponse.json({ context });
}
