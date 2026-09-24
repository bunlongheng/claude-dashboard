import { getDb } from "./rag-db";
import { assembleContext } from "./eval/configs";

// One memory mode, always on: keyword retrieval (FTS5) over the local index.
// It won the benchmark (4.4/5 against 4.1 for vectors and 1.4 for synthesis),
// needs no key and no model, and cannot fail for a missing dependency - which
// matters because the SessionStart hook discards errors.
export async function buildContext(prompt: string, project?: string): Promise<{ context: string; meta: { chunks: number; size: number } }> {
  const db = getDb();
  const { context, size, chunks } = await assembleContext("rag", prompt);

  db.prepare("INSERT INTO context_log (project, prompt, prefs_count, chunks_count, context_size) VALUES (?, ?, ?, ?, ?)")
    .run(project || "", prompt.slice(0, 200), 0, chunks, size);
  db.prepare("INSERT INTO search_log (query, results_count) VALUES (?, ?)").run(prompt.slice(0, 200), chunks);

  return { context, meta: { chunks, size } };
}
