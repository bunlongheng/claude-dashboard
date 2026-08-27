import type { DbAdapter } from "./types";
import { sqliteDb } from "./sqlite";
import { noopDb } from "./noop";

/**
 * Database adapter - auto-detects the configured backend from env vars.
 *
 * Detection order:
 * 1. SQLite - automatic, stores in ~/.claude/dashboard.db (zero config)
 * 2. Noop - if SQLite isn't available, dashboard works with local files only
 *
 * SUPPORTED:
 *   SQLite - local database, zero config, auto-created
 *
 * PLANNED:
 *   PostgreSQL - via DATABASE_URL
 *
 * To add a new backend:
 * 1. Create lib/db/yourdb.ts implementing DbAdapter from types.ts
 * 2. Add env var detection in detectDb() below
 * 3. Submit a PR - contributions welcome!
 *
 * Note: this is a local, single-user tool - there is no auth layer.
 */

function detectDb(): DbAdapter {
    // 1. SQLite (automatic local database - zero config)
    if (sqliteDb.configured) {
        return sqliteDb;
    }

    // 2. No database - dashboard still works with local files
    return noopDb;
}

export const db: DbAdapter = detectDb();

export type { DbAdapter } from "./types";
