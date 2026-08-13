import { NextRequest, NextResponse } from "next/server";
import { getDb, type EvalQuestion } from "@/lib/rag-db";
import { withErrorHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM eval_questions ORDER BY id").all() as EvalQuestion[];
  return NextResponse.json({ questions: rows });
});

// POST { questions: [{question, expected, tags}], replace?: boolean }
export const POST = withErrorHandler(async (req: NextRequest) => {
  const db = getDb();
  const body = await req.json();
  const items: { question: string; expected?: string; tags?: string }[] = body.questions || [];
  if (body.replace) db.exec("DELETE FROM eval_questions");
  const insert = db.prepare("INSERT INTO eval_questions (question, expected, tags) VALUES (?, ?, ?)");
  const tx = db.transaction(() => {
    for (const q of items) insert.run(q.question, q.expected || "", q.tags || "");
  });
  tx();
  const count = (db.prepare("SELECT COUNT(*) as c FROM eval_questions").get() as { c: number }).c;
  return NextResponse.json({ ok: true, count });
});

export const DELETE = withErrorHandler(async () => {
  const db = getDb();
  db.exec("DELETE FROM eval_questions");
  return NextResponse.json({ ok: true });
});
