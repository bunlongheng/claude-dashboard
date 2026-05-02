import { getDb } from "./rag-db";
import Anthropic from "@anthropic-ai/sdk";

// ── Query Expansion ──────────────────────────────────────────────────────────

const EXPANSIONS: Record<string, string[]> = {
  k8s: ["kubernetes"], k8: ["kubernetes"],
  tf: ["terraform"], cdk: ["cloudformation"],
  db: ["database", "postgres", "supabase", "sqlite"],
  auth: ["authentication", "oauth", "cognito", "auth0"],
  ci: ["continuous integration", "github actions", "pipeline"],
  cd: ["continuous deployment", "deploy", "vercel"],
  fe: ["frontend", "react", "next"],
  be: ["backend", "api", "server", "express"],
  ts: ["typescript"], js: ["javascript"],
  css: ["tailwind", "styles"], ui: ["interface", "component", "page"],
  rag: ["retrieval", "memory", "knowledge", "embedding"],
  mcp: ["model context protocol", "server", "tool"],
  vpc: ["network", "subnet"], lb: ["load balancer"],
  rds: ["database", "postgres", "mysql", "aurora"],
  sqs: ["queue", "messaging"], sns: ["notification", "pubsub"],
};

const DOMAIN_ROUTES: Record<string, string[]> = {
  security: ["auth", "oauth", "jwt", "cors", "csrf", "xss", "password", "secret", "key", "token", "cognito", "iam"],
  infra: ["deploy", "vercel", "server", "port", "caddy", "nginx", "pm2", "docker", "ssh"],
  database: ["supabase", "postgres", "sqlite", "redis", "dynamo", "migration", "schema"],
  workflow: ["git", "commit", "push", "pr", "jira", "test", "lint", "eslint"],
  ui: ["tailwind", "css", "component", "page", "layout", "dark", "theme", "responsive"],
};

function expandQuery(query: string): string {
  const words = query.toLowerCase().split(/\s+/);
  const expanded = new Set(words);
  for (const w of words) {
    if (EXPANSIONS[w]) EXPANSIONS[w].forEach(e => expanded.add(e));
  }
  return [...expanded].join(" OR ");
}

function detectDomain(query: string): string | null {
  const q = query.toLowerCase();
  for (const [domain, keywords] of Object.entries(DOMAIN_ROUTES)) {
    if (keywords.some(k => q.includes(k))) return domain;
  }
  return null;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type SearchResult = {
  chunk_id: number;
  doc_id: number;
  content: string;
  project: string;
  source_type: string;
  title: string;
  score: number;
};

export type SearchResultCompact = {
  chunk_id: number;
  doc_id: number;
  title: string;
  project: string;
  source_type: string;
  score: number;
  preview: string; // first 120 chars
};

// ── Search Functions ─────────────────────────────────────────────────────────

export function ftsSearch(query: string, limit = 20): SearchResult[] {
  const db = getDb();
  const expanded = expandQuery(query);

  let results: SearchResult[];
  try {
    results = db.prepare(`
      SELECT
        c.id as chunk_id, c.doc_id, c.content,
        d.project, d.source_type, d.title,
        rank as score
      FROM chunks_fts f
      JOIN chunks c ON c.id = f.rowid
      JOIN documents d ON d.id = c.doc_id
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(expanded, limit) as SearchResult[];
  } catch {
    // Fallback to original query if expansion causes FTS error
    results = db.prepare(`
      SELECT
        c.id as chunk_id, c.doc_id, c.content,
        d.project, d.source_type, d.title,
        rank as score
      FROM chunks_fts f
      JOIN chunks c ON c.id = f.rowid
      JOIN documents d ON d.id = c.doc_id
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as SearchResult[];
  }

  // Boost by domain routing
  const domain = detectDomain(query);
  if (domain) {
    // Boost preferences and memory results for domain queries
    results.sort((a, b) => {
      const aBoost = (a.source_type === "memory" || a.source_type === "insight") ? -2 : 0;
      const bBoost = (b.source_type === "memory" || b.source_type === "insight") ? -2 : 0;
      return (a.score + aBoost) - (b.score + bBoost);
    });
  }

  // Track access
  const updateAccess = db.prepare("UPDATE documents SET access_count = access_count + 1 WHERE id = ?");
  for (const r of results.slice(0, 5)) updateAccess.run(r.doc_id);

  return results;
}

// Progressive disclosure: compact results (IDs + titles + preview)
export function ftsSearchCompact(query: string, limit = 20): SearchResultCompact[] {
  return ftsSearch(query, limit).map(r => ({
    chunk_id: r.chunk_id,
    doc_id: r.doc_id,
    title: r.title,
    project: r.project,
    source_type: r.source_type,
    score: r.score,
    preview: r.content.slice(0, 120).replace(/\n/g, " "),
  }));
}

// Get full content for specific chunk IDs (progressive disclosure layer 2)
export function getChunksByIds(ids: number[]): SearchResult[] {
  if (!ids.length) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  return db.prepare(`
    SELECT c.id as chunk_id, c.doc_id, c.content,
      d.project, d.source_type, d.title, 0 as score
    FROM chunks c JOIN documents d ON d.id = c.doc_id
    WHERE c.id IN (${placeholders})
  `).all(...ids) as SearchResult[];
}

// Entity-boosted search (3rd signal)
export function entitySearch(query: string, limit = 10): SearchResult[] {
  const db = getDb();
  const words = query.toLowerCase().split(/\s+/);
  if (!words.length) return [];

  const conditions = words.map(() => "e.name LIKE ?").join(" OR ");
  const params = words.map(w => `%${w}%`);

  try {
    return db.prepare(`
      SELECT DISTINCT c.id as chunk_id, c.doc_id, c.content,
        d.project, d.source_type, d.title, -10 as score
      FROM entities e
      JOIN entity_links el ON el.source_id = e.id OR el.target_id = e.id
      JOIN documents d ON d.id = el.doc_id
      JOIN chunks c ON c.doc_id = d.id
      WHERE ${conditions}
      LIMIT ?
    `).all(...params, limit) as SearchResult[];
  } catch {
    return [];
  }
}

export async function searchWithRerank(query: string, limit = 5): Promise<SearchResult[]> {
  // Multi-signal: FTS + entity search
  const ftsResults = ftsSearch(query, 20);
  const entityResults = entitySearch(query, 10);

  // Merge and deduplicate
  const seen = new Set<number>();
  const candidates: SearchResult[] = [];
  for (const r of [...ftsResults, ...entityResults]) {
    if (!seen.has(r.chunk_id)) { seen.add(r.chunk_id); candidates.push(r); }
  }

  if (candidates.length <= limit) return candidates;

  const anthropic = new Anthropic();
  const numbered = candidates.slice(0, 20).map((c, i) =>
    `[${i}] (${c.project}/${c.title}): ${c.content.slice(0, 300)}`
  ).join("\n\n");

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{
      role: "user",
      content: `Given this query: "${query}"\n\nPick the ${limit} most relevant chunks. Return ONLY a JSON array of indices, e.g. [2, 0, 5, 1, 4]. Most relevant first.\n\n${numbered}`,
    }],
  });

  const text = msg.content.find(b => b.type === "text")?.text ?? "[]";
  const match = text.match(/\[[\d,\s]+\]/);
  if (!match) return candidates.slice(0, limit);

  const indices: number[] = JSON.parse(match[0]);
  return indices.filter(i => i >= 0 && i < candidates.length).slice(0, limit).map(i => candidates[i]);
}

// ── Health Checks ────────────────────────────────────────────────────────────

export function runHealthChecks(): { check_type: string; severity: string; message: string }[] {
  const db = getDb();
  const checks: { check_type: string; severity: string; message: string }[] = [];

  // 1. Stale preferences (not accessed in 30 days)
  const stale = db.prepare(`
    SELECT COUNT(*) as c FROM preferences
    WHERE last_accessed IS NOT NULL AND last_accessed < datetime('now', '-30 days')
  `).get() as { c: number };
  if (stale.c > 0) checks.push({ check_type: "stale_preferences", severity: "warning", message: `${stale.c} preferences not accessed in 30+ days` });

  // 2. Duplicate-ish preferences (same category, similar keys)
  const dupeCheck = db.prepare(`
    SELECT p1.id, p1.category, p1.key, p2.key as dupe_key
    FROM preferences p1 JOIN preferences p2
    ON p1.category = p2.category AND p1.id < p2.id
    AND (p1.key LIKE '%' || p2.key || '%' OR p2.key LIKE '%' || p1.key || '%')
  `).all() as { id: number; category: string; key: string; dupe_key: string }[];
  if (dupeCheck.length > 0) checks.push({ check_type: "duplicate_preferences", severity: "warning", message: `${dupeCheck.length} potentially duplicate preferences found` });

  // 3. Projects with sessions but no memory files
  const noMemory = db.prepare(`
    SELECT DISTINCT d1.project FROM documents d1
    WHERE d1.source_type = 'conversation'
    AND NOT EXISTS (SELECT 1 FROM documents d2 WHERE d2.project = d1.project AND d2.source_type = 'memory')
    AND d1.project != 'global' AND d1.project != 'Sites'
  `).all() as { project: string }[];
  if (noMemory.length > 0) checks.push({ check_type: "no_memory_files", severity: "info", message: `${noMemory.length} projects have sessions but no memory files: ${noMemory.map(p => p.project).join(", ")}` });

  // 4. Large documents that might need splitting
  const large = db.prepare("SELECT COUNT(*) as c FROM documents WHERE LENGTH(content) > 10000").get() as { c: number };
  if (large.c > 0) checks.push({ check_type: "large_documents", severity: "info", message: `${large.c} documents exceed 10KB — consider splitting` });

  // 5. Documents not accessed recently
  const coldDocs = db.prepare("SELECT COUNT(*) as c FROM documents WHERE access_count = 0").get() as { c: number };
  if (coldDocs.c > 0) checks.push({ check_type: "cold_documents", severity: "info", message: `${coldDocs.c} documents never accessed via search` });

  // 6. Empty preferences
  const emptyPrefs = db.prepare("SELECT COUNT(*) as c FROM preferences WHERE TRIM(value) = ''").get() as { c: number };
  if (emptyPrefs.c > 0) checks.push({ check_type: "empty_preferences", severity: "warning", message: `${emptyPrefs.c} preferences have empty values` });

  // Store results
  db.exec("DELETE FROM health_checks");
  const insert = db.prepare("INSERT INTO health_checks (check_type, severity, message) VALUES (?, ?, ?)");
  for (const c of checks) insert.run(c.check_type, c.severity, c.message);

  if (checks.length === 0) checks.push({ check_type: "all_clear", severity: "success", message: "No issues found — RAG is healthy" });

  return checks;
}

// ── Stats ────────────────────────────────────────────────────────────────────

export function getStats() {
  const db = getDb();
  const docs = db.prepare("SELECT COUNT(*) as count FROM documents").get() as { count: number };
  const chunks = db.prepare("SELECT COUNT(*) as count FROM chunks").get() as { count: number };
  const prefs = db.prepare("SELECT COUNT(*) as count FROM preferences").get() as { count: number };
  const searches = db.prepare("SELECT COUNT(*) as count FROM search_log").get() as { count: number };
  const projects = db.prepare("SELECT COUNT(DISTINCT project) as count FROM documents").get() as { count: number };
  const lastIngest = db.prepare("SELECT MAX(updated_at) as t FROM documents").get() as { t: string | null };
  const entities = db.prepare("SELECT COUNT(*) as count FROM entities").get() as { count: number };
  const turns = db.prepare("SELECT COUNT(*) as count FROM turns").get() as { count: number };
  const recentSearches = db.prepare("SELECT query, results_count, created_at FROM search_log ORDER BY created_at DESC LIMIT 10").all();

  // Context injection stats
  let contextInjections = 0, totalContextSize = 0, recentContexts: any[] = [];
  try {
    const ci = db.prepare("SELECT COUNT(*) as count FROM context_log").get() as { count: number };
    const cs = db.prepare("SELECT SUM(context_size) as total FROM context_log").get() as { total: number | null };
    contextInjections = ci.count;
    totalContextSize = cs.total || 0;
    recentContexts = db.prepare("SELECT project, prompt, prefs_count, chunks_count, context_size, created_at FROM context_log ORDER BY created_at DESC LIMIT 10").all();
  } catch { /* table might not exist yet */ }

  return {
    documents: docs.count,
    chunks: chunks.count,
    preferences: prefs.count,
    searches: searches.count,
    projects: projects.count,
    entities: entities.count,
    turns: turns.count,
    lastIngest: lastIngest.t,
    recentSearches,
    contextInjections,
    totalContextSize,
    recentContexts,
  };
}
