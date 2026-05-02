import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/rag-db";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const db = getDb();
  const project = req.nextUrl.searchParams.get("project");
  const type = req.nextUrl.searchParams.get("type");
  let sql = "SELECT id, source_path, source_type, project, title, LENGTH(content) as size, (SELECT COUNT(*) FROM chunks WHERE doc_id = d.id) as chunk_count, created_at, updated_at FROM documents d WHERE 1=1";
  const params: any[] = [];
  if (project) { sql += " AND project = ?"; params.push(project); }
  if (type) { sql += " AND source_type = ?"; params.push(type); }
  sql += " ORDER BY project, source_type, title";
  return NextResponse.json(db.prepare(sql).all(...params));
}
