import { getDb, getSetting } from "./rag-db";
import { searchWithRerank } from "./rag-search";
import { assembleContext } from "./eval/configs";
import { resolveMode, FALLBACK_MODE } from "./rag-capabilities";
import type { Preference, EvalConfig } from "./rag-db";

export async function buildContext(prompt: string, project?: string): Promise<{ context: string; meta: { prefs: number; chunks: number; size: number; mode?: EvalConfig; fallbackFrom?: EvalConfig; reason?: string } }> {
  const db = getDb();

  // When a memory mode is selected on the /context page, route through the same
  // per-mode assembly the benchmark uses, so the dropdown is a real live switch.
  // Unset = legacy behavior below (all prefs + reranked chunks).
  const stored = getSetting("memory_mode") as EvalConfig | null;
  if (stored) {
    // A mode that was valid when it was picked can stop being valid later, and
    // the SessionStart hook discards errors - a throw here costs the session its
    // memory silently. Degrade to plain retrieval and report it instead.
    const resolved = await resolveMode(stored);
    let { mode, fallbackFrom, reason } = resolved;

    // The probe catches what is statically knowable. Anything else that breaks
    // mid-assembly - a rejected key, a model that will not load - lands here,
    // and the guarantee is the same either way: a session never loses its
    // memory over a broken enrichment layer.
    let assembled;
    try {
        assembled = await assembleContext(mode, prompt);
    } catch (err) {
        if (mode === FALLBACK_MODE) throw err;
        fallbackFrom = stored;
        reason = err instanceof Error ? err.message : "assembly failed";
        mode = FALLBACK_MODE;
        assembled = await assembleContext(mode, prompt);
    }
    const { context, size } = assembled;
    db.prepare("INSERT INTO context_log (project, prompt, prefs_count, chunks_count, context_size) VALUES (?, ?, ?, ?, ?)")
      .run(project || "", prompt.slice(0, 200), 0, 0, size);
    db.prepare("INSERT INTO search_log (query, results_count) VALUES (?, ?)").run(prompt.slice(0, 200), 0);
    return { context, meta: { prefs: 0, chunks: 0, size, mode, fallbackFrom, reason } };
  }

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
