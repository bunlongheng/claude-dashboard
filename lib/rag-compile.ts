import Anthropic from "@anthropic-ai/sdk";
import { getDb, syncFts } from "./rag-db";
import type { Doc } from "./rag-db";

const SYSTEM = `You compile Claude Code session insights into structured knowledge articles.

Given multiple session insights from the same project, compile them into a single knowledge article.

Return ONLY a valid JSON object:
{
  "title": "<article title, 5-8 words>",
  "decisions": ["Decision 1: chose X over Y because...", ...],
  "lessons": ["Lesson: never do X because...", ...],
  "gotchas": ["Gotcha: X looks like it works but actually...", ...],
  "patterns": ["Pattern: when doing X, always Y", ...],
  "stack": ["Technology or tool used", ...]
}

Rules:
- Merge overlapping insights — don't repeat
- Be specific and actionable
- Max 5 items per category
- Skip categories with no content (return empty array)`;

export async function compileArticles(): Promise<number> {
  const db = getDb();
  const anthropic = new Anthropic();

  // Group insights by project
  const projects = db.prepare(`
    SELECT DISTINCT project FROM documents
    WHERE source_type = 'insight' AND project != 'Sites' AND project != 'global'
    AND NOT EXISTS (SELECT 1 FROM documents d2 WHERE d2.source_type = 'article' AND d2.project = documents.project)
  `).all() as { project: string }[];

  let created = 0;

  for (const { project } of projects) {
    const insights = db.prepare(
      "SELECT content FROM documents WHERE source_type = 'insight' AND project = ? ORDER BY updated_at DESC LIMIT 10"
    ).all(project) as { content: string }[];

    if (insights.length < 2) continue; // Need at least 2 insights to compile

    const combined = insights.map(i => i.content.slice(0, 1500)).join("\n\n---\n\n");

    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM,
        messages: [{ role: "user", content: `Project: ${project}\n\n${combined}` }],
      });

      const text = msg.content.find(b => b.type === "text")?.text ?? "{}";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;

      const parsed = JSON.parse(match[0]);
      if (!parsed.title) continue;

      const sections: string[] = [`# ${parsed.title}\n`];
      if (parsed.decisions?.length) sections.push(`## Decisions\n${parsed.decisions.map((d: string) => `- ${d}`).join("\n")}\n`);
      if (parsed.lessons?.length) sections.push(`## Lessons\n${parsed.lessons.map((l: string) => `- ${l}`).join("\n")}\n`);
      if (parsed.gotchas?.length) sections.push(`## Gotchas\n${parsed.gotchas.map((g: string) => `- ${g}`).join("\n")}\n`);
      if (parsed.patterns?.length) sections.push(`## Patterns\n${parsed.patterns.map((p: string) => `- ${p}`).join("\n")}\n`);
      if (parsed.stack?.length) sections.push(`## Stack\n${parsed.stack.map((s: string) => `- ${s}`).join("\n")}\n`);

      const content = sections.join("\n");
      const hash = `article-${project}-${Date.now()}`;

      const result = db.prepare(
        "INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(`article:${project}`, "article", project, `Article: ${parsed.title}`, content, hash);

      const docId = result.lastInsertRowid as number;
      db.prepare("INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)")
        .run(docId, 0, content, Math.ceil(content.length / 4));

      created++;
    } catch (e) {
      console.error(`Failed to compile article for ${project}:`, e);
    }
  }

  if (created > 0) syncFts(db);
  return created;
}
