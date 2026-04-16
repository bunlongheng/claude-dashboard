import type { DbAdapter, AuthAdapter } from "./types";
import { sqliteDb } from "./sqlite";
import { simpleAuth } from "./simple-auth";
import { noopDb, noopAuth } from "./noop";

/**
 * Database adapter — auto-detects the configured backend from env vars.
 *
 * Detection order:
 * 1. SQLite — automatic, stores in ~/.claude/dashboard.db (zero config)
 * 2. Noop — if SQLite isn't available, dashboard works with local files only
 *
 * SUPPORTED:
 *   SQLite — local database, zero config, auto-created
 *
 * PLANNED:
 *   PostgreSQL — via DATABASE_URL
 *
 * NOT SUPPORTED:
 *   MySQL — use PostgreSQL instead
 *
 * To add a new backend:
 * 1. Create lib/db/yourdb.ts implementing DbAdapter from types.ts
 * 2. Add env var detection in detectDb() below
 * 3. Submit a PR — contributions welcome!
 */

function detectDb(): DbAdapter {
    // 1. SQLite (automatic local database — zero config)
    if (sqliteDb.configured) {
        return sqliteDb;
    }

    // 2. No database — dashboard still works with local files
    return noopDb;
}

function detectAuth(): AuthAdapter {
    // 1. Simple password auth (just set ADMIN_PASSWORD env var)
    if (process.env.ADMIN_PASSWORD) {
        return simpleAuth;
    }
    // 2. No auth — localhost/LAN only
    return noopAuth;
}

export const db: DbAdapter = detectDb();
export const auth: AuthAdapter = detectAuth();

export type { DbAdapter, AuthAdapter, QueryOptions } from "./types";
