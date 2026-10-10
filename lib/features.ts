// Optional-feature flags for the open-source edition.
//
// RAG + local vector search (semantic memory over your sessions/CLAUDE.md) is
// opt-in: it ingests your data into a local SQLite index and downloads a small
// embedding model on first use. It requires no external service and no API key
// (AI-assisted extras light up if ANTHROPIC_API_KEY is set), but it is OFF by
// default so the dashboard stays zero-setup. Enable it by setting
// NEXT_PUBLIC_RAG_ENABLED=1 in your .env.
//
// NEXT_PUBLIC_ vars are inlined at build time, so this constant is safe to read
// from both server routes and client components.
export const RAG_ENABLED = process.env.NEXT_PUBLIC_RAG_ENABLED === "1";
