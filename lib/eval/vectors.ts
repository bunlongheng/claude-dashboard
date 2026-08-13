import { getDb } from "../rag-db";
import { embed, embedBatch, cosine, toBuffer, fromBuffer } from "./embeddings";

type ChunkRow = { id: number; content: string; doc_id: number; project: string; source_type: string; title: string };

// Embed every chunk that doesn't yet have a vector. Idempotent.
export async function indexChunks(): Promise<{ embedded: number; total: number }> {
  const db = getDb();
  const missing = db.prepare(`
    SELECT c.id, c.content FROM chunks c
    LEFT JOIN chunk_vectors v ON v.chunk_id = c.id
    WHERE v.chunk_id IS NULL
  `).all() as { id: number; content: string }[];

  if (missing.length === 0) {
    const total = (db.prepare("SELECT COUNT(*) as c FROM chunk_vectors").get() as { c: number }).c;
    return { embedded: 0, total };
  }

  const insert = db.prepare("INSERT OR REPLACE INTO chunk_vectors (chunk_id, dim, vector) VALUES (?, ?, ?)");
  const BATCH = 64;
  let embedded = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const slice = missing.slice(i, i + BATCH);
    const vectors = await embedBatch(slice.map(s => s.content));
    const tx = db.transaction(() => {
      slice.forEach((s, j) => insert.run(s.id, vectors[j].length, toBuffer(vectors[j])));
    });
    tx();
    embedded += slice.length;
  }

  const total = (db.prepare("SELECT COUNT(*) as c FROM chunk_vectors").get() as { c: number }).c;
  return { embedded, total };
}

export type VectorHit = ChunkRow & { score: number };

// Brute-force cosine search over stored vectors. Fine for a few thousand chunks.
export async function vectorSearch(query: string, limit = 5): Promise<VectorHit[]> {
  const db = getDb();
  const qv = await embed(query);

  const rows = db.prepare(`
    SELECT v.chunk_id as id, v.vector, c.content, c.doc_id, d.project, d.source_type, d.title
    FROM chunk_vectors v
    JOIN chunks c ON c.id = v.chunk_id
    JOIN documents d ON d.id = c.doc_id
  `).all() as (ChunkRow & { vector: Buffer })[];

  const scored = rows.map(r => ({
    id: r.id, content: r.content, doc_id: r.doc_id,
    project: r.project, source_type: r.source_type, title: r.title,
    score: cosine(qv, fromBuffer(r.vector)),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function vectorCount(): number {
  const db = getDb();
  return (db.prepare("SELECT COUNT(*) as c FROM chunk_vectors").get() as { c: number }).c;
}
