import { type EvalConfig } from "../rag-db";
import { ftsSearch, type SearchResult } from "../rag-search";
import { vectorSearch } from "./vectors";

export type Assembled = {
  context: string;
  size: number;
  chunks: number;
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

export async function assembleContext(config: EvalConfig, question: string): Promise<Assembled> {
  const TOPK = 6;

  if (config === "nothing") {
    return { context: "", size: 0, chunks: 0 };
  }

  const hits = config === "rag"
    ? ftsSearch(sanitizeForFts(question), TOPK)
    : await hybridHits(question, TOPK);
  const context = formatHits(hits);
  return { context, size: context.length, chunks: hits.length };
}
