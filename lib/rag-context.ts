import { getDb } from "./rag-db";
import { searchWithRerank } from "./rag-search";
import type { Preference } from "./rag-db";

export async function buildContext(prompt: string, project?: string): Promise<{ context: string; meta: { prefs: number; chunks: number; size: number } }> {
  const db = getDb();

  // 1. Get all preferences
  const prefs = db.prepare("SELECT * FROM preferences ORDER BY category, key").all() as Preference[];

  // 2. Search for relevant chunks
  const results = await searchWithRerank(prompt, 5);

  // 3. Assemble context block
  const sections: string[] = [];

  if (prefs.length > 0) {
    const grouped: Record<string, Preference[]> = {};
    for (const p of prefs) {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    }
    sections.push("## Your Preferences\n");
    for (const [cat, items] of Object.entries(grouped)) {
      sections.push(`### ${cat}`);
      for (const p of items) {
        sections.push(`- ${p.key}: ${p.value}`);
      }
    }
  }

  if (results.length > 0) {
    sections.push("\n## Relevant Context\n");
    for (const r of results) {
      sections.push(`### ${r.title} (${r.project})\n${r.content}\n`);
    }
  }

  const context = sections.join("\n");

  // 4. Log this context injection
  db.prepare("INSERT INTO context_log (project, prompt, prefs_count, chunks_count, context_size) VALUES (?, ?, ?, ?, ?)")
    .run(project || "", prompt.slice(0, 200), prefs.length, results.length, context.length);

  db.prepare("INSERT INTO search_log (query, results_count) VALUES (?, ?)").run(prompt.slice(0, 200), results.length);

  return { context, meta: { prefs: prefs.length, chunks: results.length, size: context.length } };
}
