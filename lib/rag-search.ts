import { getDb } from "./rag-db";

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

type SearchResultCompact = {
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
  if (large.c > 0) checks.push({ check_type: "large_documents", severity: "info", message: `${large.c} documents exceed 10KB - consider splitting` });

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

  if (checks.length === 0) checks.push({ check_type: "all_clear", severity: "success", message: "No issues found - RAG is healthy" });

  return checks;
}

// ── Stats ────────────────────────────────────────────────────────────────────

export function getStats(days = 0) {
  const db = getDb();
  // Windowed slice for the Overview hero row: what the RAG actually did in the
  // selected range, not what it holds. days <= 0 means the whole log.
  // created_at is SQLite datetime() text ("YYYY-MM-DD HH:MM:SS", UTC), so the cutoff
  // is built in SQL too - an ISO "T" string sorts after every same-day row.
  // Calendar days in local time like the Jev page: days=1 is since local midnight.
  const since = days > 0 ? `-${days - 1} days` : "";
  const windowCount = (table: string, expr = "COUNT(*)") => {
    try {
      const sql = since
        ? `SELECT ${expr} as count FROM ${table} WHERE created_at >= datetime('now', 'localtime', 'start of day', ?, 'utc')`
        : `SELECT ${expr} as count FROM ${table}`;
      const row = since ? db.prepare(sql).get(since) : db.prepare(sql).get();
      return (row as { count: number }).count;
    } catch { return 0; }
  };
  // Same cutoff for the Overview sections below the hero row, so they follow the filter too.
  const where = since ? "WHERE created_at >= datetime('now', 'localtime', 'start of day', ?, 'utc')" : "";
  const args = since ? [since] : [];
  const windowed = {
    days, loaded: windowCount("context_log"), searches: windowCount("search_log"), docs: windowCount("documents"),
    chunks: windowCount("chunks"), projects: windowCount("documents", "COUNT(DISTINCT project)"),
  };
  const docs = db.prepare("SELECT COUNT(*) as count FROM documents").get() as { count: number };
  const chunks = db.prepare("SELECT COUNT(*) as count FROM chunks").get() as { count: number };
  const prefs = db.prepare("SELECT COUNT(*) as count FROM preferences").get() as { count: number };
  const searches = db.prepare("SELECT COUNT(*) as count FROM search_log").get() as { count: number };
  const projects = db.prepare("SELECT COUNT(DISTINCT project) as count FROM documents").get() as { count: number };
  const lastIngest = db.prepare("SELECT MAX(updated_at) as t FROM documents").get() as { t: string | null };
  const entities = db.prepare("SELECT COUNT(*) as count FROM entities").get() as { count: number };
  const turns = db.prepare("SELECT COUNT(*) as count FROM turns").get() as { count: number };
  const recentSearches = db.prepare(`SELECT query, results_count, created_at FROM search_log ${where} ORDER BY created_at DESC LIMIT 10`).all(...args);

  // Context injection stats
  let contextInjections = 0, totalContextSize = 0, recentContexts: { project: string; prefs_count: number; chunks_count: number; context_size: number; created_at: string; times: number }[] = [];
  try {
    const ci = db.prepare(`SELECT COUNT(*) as count FROM context_log ${where}`).get(...args) as { count: number };
    const cs = db.prepare(`SELECT SUM(context_size) as total FROM context_log ${where}`).get(...args) as { total: number | null };
    contextInjections = ci.count;
    totalContextSize = cs.total || 0;
    recentContexts = db.prepare(`
      SELECT project, prefs_count, chunks_count, context_size, MAX(created_at) as created_at, COUNT(*) as times
      FROM context_log ${where}
      GROUP BY project
      ORDER BY MAX(created_at) DESC
      LIMIT 10
    `).all(...args) as { project: string; prefs_count: number; chunks_count: number; context_size: number; created_at: string; times: number }[];
  } catch { /* table might not exist yet */ }

  // Type breakdown for charts
  const typeCounts = db.prepare(`SELECT source_type, COUNT(*) as count FROM documents ${where} GROUP BY source_type ORDER BY count DESC`).all(...args) as { source_type: string; count: number }[];

  // Project breakdown for charts
  const projectCounts = db.prepare(`SELECT project, COUNT(*) as count FROM documents ${where} GROUP BY project ORDER BY count DESC LIMIT 10`).all(...args) as { project: string; count: number }[];

  // Preference categories for radar chart
  const prefCategories = db.prepare(`SELECT category, COUNT(*) as count FROM preferences GROUP BY category ORDER BY count DESC`).all() as { category: string; count: number }[];

  // Ingestion timeline (docs created per day)
  const timeline = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as count,
      SUM(CASE WHEN source_type='conversation' THEN 1 ELSE 0 END) as conversations,
      SUM(CASE WHEN source_type='insight' THEN 1 ELSE 0 END) as insights,
      SUM(CASE WHEN source_type='memory' THEN 1 ELSE 0 END) as memory
    FROM documents ${where} GROUP BY DATE(created_at) ORDER BY day
  `).all(...args) as { day: string; count: number; conversations: number; insights: number; memory: number }[];

  // Hero card trends in local time: per hour up to now on Today, per day otherwise.
  const trend: { key: string; docs: number; chunks: number; projects: number; prefs: number }[] = [];
  if (since) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    if (days === 1) for (let h = 0; h <= now.getHours(); h++) trend.push({ key: pad(h), docs: 0, chunks: 0, projects: 0, prefs: 0 });
    else for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      trend.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, docs: 0, chunks: 0, projects: 0, prefs: 0 });
    }
    const bucket = days === 1 ? "strftime('%H', created_at, 'localtime')" : "DATE(created_at, 'localtime')";
    const byKey = new Map(trend.map(t => [t.key, t]));
    const fill = (table: string, expr: string, field: "docs" | "chunks" | "projects" | "prefs") => {
      try {
        const rows = db.prepare(`SELECT ${bucket} as b, ${expr} as c FROM ${table} ${where} GROUP BY b`).all(...args) as { b: string; c: number }[];
        for (const r of rows) { const t = byKey.get(r.b); if (t) t[field] = r.c; }
      } catch { /* table might not exist yet */ }
    };
    fill("documents", "COUNT(*)", "docs");
    fill("chunks", "COUNT(*)", "chunks");
    fill("documents", "COUNT(DISTINCT project)", "projects");
    fill("preferences", "COUNT(*)", "prefs");
  }

  // Context injection timeline
  let injectionTimeline: { day: string; count: number; avg_size: number }[] = [];
  try {
    injectionTimeline = db.prepare(`
      SELECT DATE(created_at) as day, COUNT(*) as count, ROUND(AVG(context_size)) as avg_size
      FROM context_log ${where} GROUP BY DATE(created_at) ORDER BY day
    `).all(...args) as { day: string; count: number; avg_size: number }[];
  } catch {}

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
    typeCounts,
    projectCounts,
    prefCategories,
    timeline,
    injectionTimeline,
    windowed,
    trend,
  };
}
