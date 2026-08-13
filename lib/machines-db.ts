import type Database from "better-sqlite3";

const DB_PATH = process.env.MACHINES_DB_PATH || "";

// Opens the shared machines registry DB read-only. Returns null when
// MACHINES_DB_PATH is unset or the file can't be opened (missing, locked,
// wrong Node ABI, etc). Caller owns the handle and must call db.close().
// require() (not a static import) keeps better-sqlite3 out of the module
// graph entirely when no DB is configured - same lazy-load behavior the
// routes had before this was extracted.
export function openMachinesDb(): Database.Database | null {
    if (!DB_PATH) return null;
    try {
        const Ctor = require("better-sqlite3");
        return new Ctor(DB_PATH, { readonly: true });
    } catch {
        return null;
    }
}

// This machine's id in the machines registry: LOCAL_MACHINE_ID env override,
// else the short hostname.
export function localMachineId(): string {
    return process.env.LOCAL_MACHINE_ID || require("os").hostname().split(".")[0];
}
