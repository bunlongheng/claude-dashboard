import { NextRequest, NextResponse } from "next/server";
import { isLocal } from "@/lib/is-local";

export async function middleware(req: NextRequest) {
    const res = NextResponse.next({ request: req });

    // ── Security Headers (OWASP Top 10) ────────────────────────────────────
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("X-XSS-Protection", "1; mode=block");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    // Skip auth for local/dev
    if (isLocal(req)) return res;

    // Auth is handled by the simple-auth adapter — just pass through
    return res;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
