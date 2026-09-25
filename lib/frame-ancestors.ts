// Who may put this dashboard in an <iframe>. Default: nobody, except the
// graphify page which the Context page embeds same-origin. FRAME_ANCESTORS is
// a space or comma separated list of origins (http://localhost:3212) for local
// tools like the Site Emulator that render the dashboard inside a device frame.
export function frameHeaders(pathname: string, allow = process.env.FRAME_ANCESTORS || ""): { csp: string; xfo: string | null } {
    const origins = allow.split(/[\s,]+/).filter(Boolean);
    if (pathname.startsWith("/graphify")) return { csp: "'self'", xfo: "SAMEORIGIN" };
    if (origins.length === 0) return { csp: "'none'", xfo: "DENY" };
    // X-Frame-Options has no allowlist form, so it is omitted and the CSP
    // frame-ancestors directive carries the whole policy.
    return { csp: ["'self'", ...origins].join(" "), xfo: null };
}
