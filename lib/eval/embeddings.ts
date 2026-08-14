// Local, key-free embeddings via transformers.js (all-MiniLM-L6-v2, 384-dim).
// Runs in-process, uses the on-disk HF cache. cost = 0.

const MODEL = process.env.EVAL_EMBED_MODEL || "Xenova/all-MiniLM-L6-v2";

type Extractor = (text: string | string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>;

let extractorPromise: Promise<Extractor> | null = null;

async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      // transformers.js is an OPTIONAL dependency - it (and its heavy native deps:
      // onnxruntime, sharp) are only needed for RAG vector search, which is opt-in.
      // A default install does not pull it, so import it dynamically and fail with a
      // clear instruction if it is missing. The variable specifier keeps the bundler
      // from statically requiring it.
      const pkg = "@huggingface/transformers";
      let mod: { pipeline: (task: string, model: string) => Promise<unknown> };
      try {
        mod = await import(/* webpackIgnore: true */ pkg);
      } catch {
        throw new Error(
          "RAG vector search needs the embedding model. Install it with: npm install @huggingface/transformers"
        );
      }
      return (await mod.pipeline("feature-extraction", MODEL)) as unknown as Extractor;
    })();
  }
  return extractorPromise;
}

export async function embed(text: string): Promise<Float32Array> {
  const extractor = await getExtractor();
  const out = await extractor(text, { pooling: "mean", normalize: true });
  return out.data as Float32Array;
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const extractor = await getExtractor();
  const vectors: Float32Array[] = [];
  // Process one at a time to keep memory flat; model is fast for short chunks.
  for (const t of texts) {
    const out = await extractor(t, { pooling: "mean", normalize: true });
    vectors.push(Float32Array.from(out.data));
  }
  return vectors;
}

// Vectors are L2-normalized, so dot product == cosine similarity.
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

export function toBuffer(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function fromBuffer(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
