import { NextRequest, NextResponse } from "next/server";
import { isLocalHost } from "@/lib/is-local";

// Cross-machine fetches: when the dashboard on one machine hits the API
// on another machine over the LAN, the browser does CORS. Echo back
// the Origin (Allow-Origin: *  + credentials is invalid) only when it's a known
// LAN address, otherwise leave the headers off so prod is unchanged.
function applyLanCors(req: NextRequest, res: NextResponse) {
    const origin = req.headers.get("origin");
    if (!origin) return;
    try {
        const u = new URL(origin);
        if (!isLocalHost(u.host)) return;
        res.headers.set("Access-Control-Allow-Origin", origin);
        res.headers.set("Vary", "Origin");
        // No Allow-Credentials: cross-machine auth is a bearer in the Authorization
        // header, never cookies, so credentialed CORS is unnecessary - and omitting
        // it stops any LAN page from making credential-bearing cross-origin calls.
        res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.headers.set("Access-Control-Max-Age", "600");
    } catch { /* malformed Origin header - ignore */ }
}

export async function middleware(req: NextRequest) {
    // Preflight: respond directly so the actual route handler never runs.
    // This is what the browser sends before every cross-origin POST/DELETE/etc.
    if (req.method === "OPTIONS") {
        const pre = new NextResponse(null, { status: 204 });
        applyLanCors(req, pre);
        return pre;
    }

    const res = NextResponse.next({ request: req });

    // ── Security Headers (OWASP Top 10) ────────────────────────────────────
    res.headers.set("X-Content-Type-Options", "nosniff");
    // The graphify knowledge graph is embedded same-origin in the Context page,
    // so it needs SAMEORIGIN; everything else stays DENY.
    res.headers.set("X-Frame-Options", req.nextUrl.pathname.startsWith("/graphify") ? "SAMEORIGIN" : "DENY");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    // Safe CSP subset: locks object/base-uri and modern clickjacking protection
    // without constraining script/style/img sources, so it can't break Next.js
    // hydration or the inline-styled UI. A nonce-based script-src is a follow-up.
    // (X-XSS-Protection dropped - deprecated and ignored by modern browsers.)
    const frameAncestors = req.nextUrl.pathname.startsWith("/graphify") ? "'self'" : "'none'";
    res.headers.set(
        "Content-Security-Policy",
        `object-src 'none'; base-uri 'self'; frame-ancestors ${frameAncestors}`
    );
    // HSTS only over HTTPS (Caddy/Tailscale/Vercel) so plain-HTTP LAN use is
    // unaffected - browsers ignore HSTS on http anyway.
    if (req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https") {
        res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    // LAN CORS for the multi-machine dropdown
    applyLanCors(req, res);

    // No global auth gate here: the Host header this would key on is client-
    // controlled (spoofable), so it cannot be a trust boundary. Read/nav routes
    // stay open for the local-first single-user model; the genuinely sensitive
    // routes (settings writes, TTY input) self-guard with a same-site check
    // instead. See lib/route-guard.ts.
    return res;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
