import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/rag-db";
import { withErrorHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const db = getDb();
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const chunks = db.prepare("SELECT * FROM chunks WHERE doc_id = ? ORDER BY chunk_index").all(id);
  return NextResponse.json({ ...doc, chunks });
});
