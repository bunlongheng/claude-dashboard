import { getDb, type EvalConfig, type Preference } from "../rag-db";
import { ftsSearch, type SearchResult } from "../rag-search";
import { vectorSearch } from "./vectors";
import { kpSynthesize, type Usage } from "./llm";

export type Assembled = {
  context: string;
  size: number;
  extraUsage: Usage[]; // LLM cost incurred while assembling (KP synthesis)
};

function formatHits(hits: { project: string; title: string; content: string }[]): string {
  return hits.map(h => `[${h.project}/${h.title}]\n${h.content}`).join("\n\n");
}

// Strip FTS5-special characters; full-sentence questions contain ?,",-,etc.
function sanitizeForFts(q: string): string {
  return q.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Merge FTS + vector hits, dedup by chunk id, cap at `limit`.
async function hybridHits(question: string, limit: number): Promise<SearchResult[]> {
  const fts = ftsSearch(sanitizeForFts(question), limit);
  const vecRaw = await vectorSearch(question, limit);
  // Normalize vector hits (which use `id`) into SearchResult shape (`chunk_id`).
  const vec: SearchResult[] = vecRaw.map(v => ({
    chunk_id: v.id, doc_id: v.doc_id, content: v.content,
    project: v.project, source_type: v.source_type, title: v.title, score: v.score,
  }));
  const seen = new Set<number>();
  const merged: SearchResult[] = [];
  // Interleave so both signals are represented.
  const maxLen = Math.max(fts.length, vec.length);
  for (let i = 0; i < maxLen; i++) {
    for (const r of [fts[i], vec[i]]) {
      if (!r || seen.has(r.chunk_id)) continue;
      seen.add(r.chunk_id);
      merged.push(r);
    }
  }
  return merged.slice(0, limit);
}

// Full canonical wiki: preferences + all memory docs. Used by KP-only.
function wikiCorpus(): string {
  const db = getDb();
  const prefs = db.prepare("SELECT * FROM preferences ORDER BY category, key").all() as Preference[];
  const memDocs = db.prepare(
    "SELECT title, project, content FROM documents WHERE source_type IN ('memory','global_rules','claude_md')"
  ).all() as { title: string; project: string; content: string }[];

  const parts: string[] = [];
  if (prefs.length) {
    parts.push("PREFERENCES:\n" + prefs.map(p => `- [${p.category}] ${p.key}: ${p.value}`).join("\n"));
  }
  for (const d of memDocs) parts.push(`[${d.project}/${d.title}]\n${d.content}`);
  // Cap to keep the synthesis input within the model context window.
  // (A deduped canonical wiki would make this cap unnecessary.)
  const MAX = Number(process.env.EVAL_WIKI_MAX_CHARS || 60000);
  return parts.join("\n\n").slice(0, MAX);
}

export async function assembleContext(config: EvalConfig, question: string): Promise<Assembled> {
  const TOPK = 6;

  if (config === "nothing") {
    return { context: "", size: 0, extraUsage: [] };
  }

  if (config === "rag") {
    const hits = ftsSearch(sanitizeForFts(question), TOPK);
    const context = formatHits(hits);
    return { context, size: context.length, extraUsage: [] };
  }

  if (config === "rag_vector") {
    const hits = await hybridHits(question, TOPK);
    const context = formatHits(hits);
    return { context, size: context.length, extraUsage: [] };
  }

  if (config === "rag_vector_kp") {
    const hits = await hybridHits(question, TOPK);
    const raw = formatHits(hits);
    const { brief, usage } = await kpSynthesize(question, raw);
    return { context: brief, size: brief.length, extraUsage: [usage] };
  }

  // kp: synthesize over the whole canonical wiki, no retrieval ranking.
  const raw = wikiCorpus();
  const { brief, usage } = await kpSynthesize(question, raw);
  return { context: brief, size: brief.length, extraUsage: [usage] };
}
