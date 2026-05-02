import { NextResponse } from "next/server";
import { compileArticles } from "@/lib/rag-compile";
export const dynamic = "force-dynamic";
export async function POST() {
  const count = await compileArticles();
  return NextResponse.json({ compiled: count });
}
