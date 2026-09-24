import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
// RAG_DB_PATH lets tests point at an isolated throwaway DB (mirrors SQLITE_PATH
// in the app db). Defaults to the real data/rag.db in normal use.
const DB_PATH = process.env.RAG_DB_PATH || path.join(DB_DIR, "rag.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path  TEXT NOT NULL UNIQUE,
      source_type  TEXT NOT NULL,
      project      TEXT NOT NULL DEFAULT '',
      title        TEXT NOT NULL DEFAULT '',
      content      TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id      INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content     TEXT NOT NULL,
      token_count INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS preferences (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category    TEXT NOT NULL,
      key         TEXT NOT NULL,
      value       TEXT NOT NULL,
      source_doc  INTEGER REFERENCES documents(id),
      confidence  REAL NOT NULL DEFAULT 1.0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(category, key)
    );

    CREATE TABLE IF NOT EXISTS search_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      query         TEXT NOT NULL,
      results_count INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS context_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      project       TEXT NOT NULL DEFAULT '',
      prompt        TEXT NOT NULL DEFAULT '',
      prefs_count   INTEGER NOT NULL DEFAULT 0,
      chunks_count  INTEGER NOT NULL DEFAULT 0,
      context_size  INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entities (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      type        TEXT NOT NULL DEFAULT 'concept',
      access_count INTEGER NOT NULL DEFAULT 0,
      last_accessed TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entity_links (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id   INTEGER NOT NULL REFERENCES entities(id),
      target_id   INTEGER NOT NULL REFERENCES entities(id),
      relation    TEXT NOT NULL DEFAULT 'related',
      doc_id      INTEGER REFERENCES documents(id),
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_id, target_id, relation)
    );

    CREATE TABLE IF NOT EXISTS turns (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_doc INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      turn_index  INTEGER NOT NULL,
      role        TEXT NOT NULL DEFAULT 'user',
      content     TEXT NOT NULL,
      timestamp   TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS health_checks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      check_type  TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'info',
      message     TEXT NOT NULL,
      target_id   INTEGER,
      target_type TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS eval_questions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      question    TEXT NOT NULL,
      expected    TEXT NOT NULL DEFAULT '',
      tags        TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS eval_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id     TEXT NOT NULL DEFAULT '',
      question_id  INTEGER NOT NULL REFERENCES eval_questions(id) ON DELETE CASCADE,
      config       TEXT NOT NULL,
      response     TEXT NOT NULL DEFAULT '',
      judge_score  REAL,
      judge_reason TEXT NOT NULL DEFAULT '',
      latency_ms   INTEGER NOT NULL DEFAULT 0,
      tokens_in    INTEGER NOT NULL DEFAULT 0,
      tokens_out   INTEGER NOT NULL DEFAULT 0,
      cost_usd     REAL NOT NULL DEFAULT 0,
      context_size INTEGER NOT NULL DEFAULT 0,
      model        TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chunk_vectors (
      chunk_id    INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
      dim         INTEGER NOT NULL,
      vector      BLOB NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_eval_runs_batch ON eval_runs(batch_id);
    CREATE INDEX IF NOT EXISTS idx_eval_runs_config ON eval_runs(config);
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
    CREATE INDEX IF NOT EXISTS idx_docs_project ON documents(project);
    CREATE INDEX IF NOT EXISTS idx_docs_type ON documents(source_type);
    CREATE INDEX IF NOT EXISTS idx_prefs_category ON preferences(category);
    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
    CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_doc);
  `);

  // Migrations for existing DBs. ALTER throws "duplicate column name" when the
  // column already exists (the normal idempotent case) - swallow ONLY that, and
  // rethrow any real error (locked db, bad SQL) instead of hiding it.
  const conn = db; // non-null here (assigned above); keeps narrowing in the closure
  const addColumn = (sql: string) => {
    try {
      conn.exec(sql);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/duplicate column name/i.test(msg)) throw e;
    }
  };
  addColumn("ALTER TABLE preferences ADD COLUMN valid_from TEXT");
  addColumn("ALTER TABLE preferences ADD COLUMN valid_to TEXT");
  addColumn("ALTER TABLE preferences ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0");
  addColumn("ALTER TABLE preferences ADD COLUMN last_accessed TEXT");
  addColumn("ALTER TABLE documents ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0");
  addColumn("ALTER TABLE documents ADD COLUMN quality_score REAL NOT NULL DEFAULT 1.0");

  // FTS5 virtual table for full-text search (standalone, not content-synced)
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content);`);
  } catch {
    // Already exists
  }

  return db;
}

// Rebuild FTS index from chunks table
export function syncFts(db: Database.Database) {
  db.exec(`DELETE FROM chunks_fts;`);
  const chunks = db.prepare("SELECT id, content FROM chunks").all() as { id: number; content: string }[];
  const insert = db.prepare("INSERT INTO chunks_fts(rowid, content) VALUES (?, ?)");
  for (const c of chunks) insert.run(c.id, c.content);
}

export type Doc = {
  id: number; source_path: string; source_type: string; project: string;
  title: string; content: string; content_hash: string;
  created_at: string; updated_at: string;
};

export type Chunk = {
  id: number; doc_id: number; chunk_index: number;
  content: string; token_count: number; created_at: string;
};

export type Preference = {
  id: number; category: string; key: string; value: string;
  source_doc: number | null; confidence: number; created_at: string;
};

export type EvalConfig = "nothing" | "rag" | "rag_vector";

export const EVAL_CONFIGS: EvalConfig[] = ["nothing", "rag", "rag_vector"];

export const EVAL_CONFIG_LABELS: Record<EvalConfig, string> = {
  nothing: "Nothing",
  rag: "RAG only",
  rag_vector: "RAG + Vector DB",
};

export type EvalQuestion = {
  id: number; question: string; expected: string; tags: string; created_at: string;
};
