# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public issue
2. Email the maintainer or use GitHub's private vulnerability reporting
3. Include steps to reproduce the issue
4. Allow time for a fix before public disclosure

## Security Design

Claude Dashboard is designed with security in mind:

- **100% local (zero-config default)** - with no `.env.local` set, all data stays on your machine
- **Zero external calls by default** - no telemetry, no analytics, no phone-home. Setting `ANTHROPIC_API_KEY` opts into sending memory/session text to Anthropic's API for RAG preference extraction, insights, compile, and semantic rerank - it is off unless you explicitly set it
- **Response headers** (`middleware.ts`) - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a `Content-Security-Policy` with `object-src 'none'`, `base-uri 'self'`, `script-src 'self' 'unsafe-inline'` (`'unsafe-eval'` added only in development for Turbopack HMR) and `frame-ancestors`. Framing is `'none'` by default (plus `X-Frame-Options: DENY`); when `FRAME_ANCESTORS` lists origins the CSP directive carries the allowlist and `X-Frame-Options` is omitted, since it has no allowlist form. `Strict-Transport-Security` is set only on HTTPS requests. `X-XSS-Protection` is deliberately not sent (deprecated, ignored by modern browsers)
- **No global auth gate, same-site guard on writes** - the `Host` header is client-controlled, so `middleware.ts` does not use it as a trust boundary. Instead every non-`GET` API route (`POST`, `PUT`, `DELETE`), plus the `search`, `brain`, `settings` and `proxy` reads, calls `requireSameSite` in `lib/route-guard.ts`: the request needs `Sec-Fetch-Site: same-origin` or `same-site` and a trusted `Host` (localhost, `.local`, `.ts.net`, private or Tailscale IPs). Cross-site pages, DNS-rebinding hosts, `curl` and LAN or Tailscale callers on another origin get `403`
- **Localhost by default** - Next binds `127.0.0.1` unless `DASHBOARD_HOST=0.0.0.0`; the WebSocket watcher on 7878 binds `127.0.0.1` unless `WS_LAN=1`. LAN CORS is only echoed for private, loopback and Tailscale origins, never with credentials
- **Service worker** - `public/sw.js` caches same-origin `GET` assets only and never `/api/*`, so no session or config data sits in the browser cache
- **Path traversal protection** - session IDs validated with an alphanumeric regex; `DELETE /api/claude/sessions` only removes `.jsonl` files inside `~/.claude/projects`; `PUT /api/claude/skills` only writes CLAUDE.md, command `.md` or `hooks.json` under `~/.claude`
- **SQL injection prevention** - all identifiers validated before use
- **No secrets in code** - .env.local is gitignored

---

Maintained by [Bunlong Heng](https://www.bunlongheng.com)
