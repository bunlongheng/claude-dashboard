import { getDb, type Preference } from "./rag-db";
import { embedBatch, cosine } from "./eval/embeddings";

// Semantic dedup: the preference dupes are paraphrases of the same rule under
// different keys/categories, so exact-match dedup misses them. We embed each
// value locally, greedily cluster by cosine similarity, and keep one canonical
// row per cluster (the longest value, as the most complete phrasing).
export async function dedupPreferences(opts?: { threshold?: number; dryRun?: boolean }): Promise<{
  before: number;
  after: number;
  removed: number;
  clusters: number;
  examples: { kept: string; merged: string[] }[];
}> {
  const db = getDb();
  const threshold = opts?.threshold ?? 0.9;
  const prefs = db.prepare("SELECT * FROM preferences ORDER BY id").all() as Preference[];
  const before = prefs.length;

  const vectors = await embedBatch(prefs.map(p => p.value));

  const assigned = new Array<number>(prefs.length).fill(-1);
  const clusters: number[][] = [];
  for (let i = 0; i < prefs.length; i++) {
    if (assigned[i] !== -1) continue;
    const cluster = [i];
    assigned[i] = clusters.length;
    for (let j = i + 1; j < prefs.length; j++) {
      if (assigned[j] !== -1) continue;
      if (cosine(vectors[i], vectors[j]) >= threshold) {
        assigned[j] = clusters.length;
        cluster.push(j);
      }
    }
    clusters.push(cluster);
  }

  const keepIds: number[] = [];
  const removeIds: number[] = [];
  const examples: { kept: string; merged: string[] }[] = [];

  for (const cluster of clusters) {
    // Canonical = longest value (most complete phrasing).
    const sorted = cluster.slice().sort((a, b) => prefs[b].value.length - prefs[a].value.length);
    const keep = sorted[0];
    keepIds.push(prefs[keep].id);
    if (cluster.length > 1) {
      const merged = sorted.slice(1);
      merged.forEach(idx => removeIds.push(prefs[idx].id));
      if (examples.length < 8) {
        examples.push({
          kept: `[${prefs[keep].category}] ${prefs[keep].key}`,
          merged: merged.map(idx => `[${prefs[idx].category}] ${prefs[idx].key}`),
        });
      }
    }
  }

  if (!opts?.dryRun && removeIds.length) {
    const del = db.prepare("DELETE FROM preferences WHERE id = ?");
    const tx = db.transaction(() => { for (const id of removeIds) del.run(id); });
    tx();
  }

  const after = before - (opts?.dryRun ? 0 : removeIds.length);
  return { before, after, removed: removeIds.length, clusters: clusters.length, examples };
}
