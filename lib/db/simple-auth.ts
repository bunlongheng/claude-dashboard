import type { AuthAdapter } from "./types";

/**
 * Simple password-based auth - works without any database.
 * Set ADMIN_PASSWORD in .env.local to enable.
 * Uses a cookie to persist the session.
 */
export const simpleAuth: AuthAdapter = {
    configured: !!process.env.ADMIN_PASSWORD,

    async getUser() {
        // In simple auth, if they got past the middleware cookie check, they're authenticated
        // The email is the ADMIN_EMAIL or just "admin"
        return { email: process.env.ADMIN_EMAIL || "admin" };
    },

    async signIn(_email: string, password: string) {
        const expected = process.env.ADMIN_PASSWORD;
        if (!expected) return { error: "Authentication not configured" };
        if (password !== expected) return { error: "Invalid password" };
        return {};
    },

    async signOut() {},
};
