import type { DbAdapter, QueryOptions } from "./types";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

const DEFAULT_PATH = path.join(os.homedir(), ".claude", "dashboard.db");
const DB_PATH = process.env.SQLITE_PATH || DEFAULT_PATH;

/**
 * SQLite database adapter - local, zero config.
 * Stores data in ~/.claude/dashboard.db alongside your Claude Code data.
 * Requires better-sqlite3 (optional dependency).
 */

function getDb() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Database = require("better-sqlite3");
        const db = new Database(DB_PATH);
        db.pragma("journal_mode = WAL");
        return db;
    } catch {
        return null;
    }
}

function ensureTables(db: any) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS claude_global_instructions (
            id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
            category TEXT DEFAULT 'general',
            title TEXT NOT NULL,
            instruction TEXT NOT NULL,
            source TEXT DEFAULT 'manual',
            confidence REAL DEFAULT 1.0,
            last_used_at TEXT,
            violations_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(category, title)
        );
        CREATE TABLE IF NOT EXISTS claude_tokens (
            session_id TEXT PRIMARY KEY,
            project TEXT,
            model TEXT,
            machine TEXT,
            input_tokens INTEGER DEFAULT 0,
            output_tokens INTEGER DEFAULT 0,
            cache_read_tokens INTEGER DEFAULT 0,
            cache_creation_tokens INTEGER DEFAULT 0,
            prompt_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS claude_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            display TEXT,
            timestamp TEXT,
            project TEXT
        );
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
            title TEXT,
            content TEXT,
            folder_name TEXT DEFAULT 'CLAUDE',
            folder_color TEXT,
            is_folder INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS claude_md_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            hash TEXT NOT NULL,
            size INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_claude_md_hash ON claude_md_versions(hash);
    `);
}

let initialized = false;

function ready(): any {
    const db = getDb();
    if (!db) return null;
    if (!initialized) {
        ensureTables(db);
        initialized = true;
    }
    return db;
}

// SQL identifier validation - prevents injection via table/column names
function isSafeIdent(name: string): boolean {
    return typeof name === "string" && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

function isSafeCols(cols: string): boolean {
    if (cols === "*") return true;
    return cols.split(",").every(c => isSafeIdent(c.trim()));
}

export const sqliteDb: DbAdapter = {
    configured: (() => {
        try {
            // Check if better-sqlite3 is available
            require.resolve("better-sqlite3");
            return true;
        } catch {
            return false;
        }
    })(),

    async query<T = Record<string, unknown>>(table: string, options?: QueryOptions): Promise<T[]> {
        if (!isSafeIdent(table)) return [];
        const db = ready();
        if (!db) return [];
        try {
            const cols = options?.select && isSafeCols(options.select) ? options.select : "*";
            let sql = `SELECT ${cols} FROM ${table}`;
            if (options?.orderBy && isSafeIdent(options.orderBy)) {
                sql += ` ORDER BY ${options.orderBy} ${options.ascending === false ? "DESC" : "ASC"}`;
            }
            if (options?.limit && Number.isInteger(options.limit)) sql += ` LIMIT ${options.limit}`;
            const rows = db.prepare(sql).all();
            db.close();
            return rows as T[];
        } catch {
            try { db.close(); } catch {}
            return [];
        }
    },

    async upsert(table: string, row: Record<string, unknown>, onConflict?: string) {
        if (!isSafeIdent(table)) return null;
        const db = ready();
        if (!db) return null;
        try {
            const keys = Object.keys(row);
            if (!keys.every(isSafeIdent)) return null;
            if (onConflict && !onConflict.split(",").every(s => isSafeIdent(s.trim()))) return null;
            const vals = Object.values(row);
            const placeholders = keys.map(() => "?").join(", ");

            let sql: string;
            if (onConflict) {
                const updateCols = keys.filter(k => !onConflict.split(",").includes(k)).map(k => `${k} = excluded.${k}`).join(", ");
                sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders}) ON CONFLICT(${onConflict}) DO UPDATE SET ${updateCols} RETURNING *`;
            } else {
                sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`;
            }

            const result = db.prepare(sql).get(...vals) as Record<string, unknown> | undefined;
            db.close();
            return result ?? null;
        } catch {
            try { db.close(); } catch {}
            return null;
        }
    },

    async update(table: string, id: string, updates: Record<string, unknown>) {
        if (!isSafeIdent(table)) return null;
        const db = ready();
        if (!db) return null;
        try {
            const keys = Object.keys(updates);
            if (!keys.every(isSafeIdent)) return null;
            const vals = Object.values(updates);
            const setCols = keys.map(k => `${k} = ?`).join(", ");
            const result = db.prepare(`UPDATE ${table} SET ${setCols} WHERE id = ? RETURNING *`).get(...vals, id) as Record<string, unknown> | undefined;
            db.close();
            return result ?? null;
        } catch {
            try { db.close(); } catch {}
            return null;
        }
    },

    async remove(table: string, id: string) {
        if (!isSafeIdent(table)) return false;
        const db = ready();
        if (!db) return false;
        try {
            const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
            db.close();
            return result.changes > 0;
        } catch {
            try { db.close(); } catch {}
            return false;
        }
    },
};
