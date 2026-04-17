import type { DbAdapter, AuthAdapter } from "./types";

/**
 * No-op database adapter - returns empty results for everything.
 * Used when no database is configured. Dashboard still works with local files.
 */
export const noopDb: DbAdapter = {
    configured: false,
    async query() { return []; },
    async upsert() { return null; },
    async update() { return null; },
    async remove() { return false; },
};

export const noopAuth: AuthAdapter = {
    configured: false,
    async getUser() { return null; },
    async signIn() { return { error: "Authentication not configured" }; },
    async signOut() {},
};
