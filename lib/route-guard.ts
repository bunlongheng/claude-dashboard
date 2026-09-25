import { NextResponse } from "next/server";
import { isTrustedHost } from "@/lib/is-local";

/**
 * Guard for sensitive local routes the browser UI calls directly (token vending,
 * TTY input, settings writes). Authorizes only same-origin/same-site fetches from
 * a trusted Host. This lets the same-origin dashboard - including when opened over
 * a LAN/Tailscale IP - keep working, while blocking cross-site CSRF/DNS-rebinding
 * pages and anonymous hosts that hit the port directly (curl sends neither signal).
 *
 * Note: 'none' (a top-level navigation - a pasted/bookmarked URL) is rejected on
 * purpose, and a trusted Host is required since same-site alone is defeated by DNS
 * rebinding (which keeps the attacker's public hostname in Host).
 */
export function requireSameSite(req: Request): Response | null {
    const site = req.headers.get("sec-fetch-site");
    if ((site === "same-origin" || site === "same-site") && isTrustedHost(req.headers.get("host") || "")) return null;
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * Softer guard for routes that local non-browser tools call with no browser
 * headers at all: the SessionStart/SessionEnd curls in ~/.claude/hooks/hooks.json
 * and the rag_context tool in mcp-server.ts (node fetch from a stdio process).
 * A modern browser always sends Sec-Fetch-Site, so a request carrying neither
 * that nor Origin is a non-browser client; it still needs a trusted Host so a
 * DNS-rebinding page (which keeps its public hostname in Host) is refused.
 */
export function requireSameSiteOrLocalTool(req: Request): Response | null {
    if (requireSameSite(req) === null) return null;
    const noBrowserSignals = !req.headers.has("sec-fetch-site") && !req.headers.has("origin");
    if (noBrowserSignals && isTrustedHost(req.headers.get("host") || "")) return null;
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
