/**
 * Check if a request is coming from a local/development environment.
 * Matches: localhost, 127.0.0.1, 10.x, 100.x (Tailscale), 172.16-31, 192.168.x, *.localhost
 * Used to bypass auth checks in local/LAN development while keeping auth in production.
 */

// 100.64.0.0/10 is Tailscale's CGNAT range (second octet 64-127); the rest of
// 100.0.0.0/8 is publicly routable and must NOT be trusted as local.
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|.*\.localhost)(:\d+)?$/;

/** For middleware / route handlers where you have the Request object */
export function isLocal(request: Request): boolean {
    const host = request.headers.get("host") || "";
    return LOCAL_HOST_RE.test(host);
}

/** For server actions / server components where you only have headers() */
export function isLocalHost(host: string): boolean {
    return LOCAL_HOST_RE.test(host);
}

/**
 * DNS-rebinding defense for secret-vending / RCE-adjacent routes: the Host header
 * must name a local/LAN/tailnet host we actually serve on. A rebinding attacker's
 * page keeps its own public hostname in Host (e.g. evil.example.com) even after the
 * IP is rebound to loopback, so it fails this check - which the same-site guard
 * alone (Sec-Fetch-Site: same-origin) cannot catch.
 */
export function isTrustedHost(host: string): boolean {
    const bare = (host || "").split(":")[0].toLowerCase().replace(/^\[|\]$/g, "");
    if (!bare) return false;
    if (bare === "::1") return true;                  // IPv6 loopback
    if (!bare.includes(".")) return true;             // single-label hostname (m4, pi5)
    if (bare.endsWith(".local") || bare.endsWith(".ts.net") || bare.endsWith(".internal")) return true;
    return isLocalHost(host);                          // localhost, 127.0.0.1, private IPs, *.localhost
}

// isSameSiteRequest was removed: it accepted Sec-Fetch-Site 'none' (top-level
// navigation), which the token/TTY guard must NOT trust. Sensitive routes now
// check same-origin/same-site + a trusted Host inline (see lib/route-guard.ts).
