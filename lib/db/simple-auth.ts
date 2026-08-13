import * as crypto from "crypto";
import type { AuthAdapter } from "./types";

// Timing-safe password compare: hash both sides so buffer lengths always match
// (timingSafeEqual throws on unequal lengths), mirroring timingSafeBearerEqual
// in lib/route-guard.ts.
function timingSafePasswordEqual(a: string, b: string): boolean {
    const ha = crypto.createHash("sha256").update(a).digest();
    const hb = crypto.createHash("sha256").update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
}

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
        if (!timingSafePasswordEqual(password, expected)) return { error: "Invalid password" };
        return {};
    },

    async signOut() {},
};
