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

- **100% local** - all data stays on your machine
- **Zero external calls** - no telemetry, no analytics, no phone-home
- **OWASP headers** - X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy
- **Path traversal protection** - session IDs validated with alphanumeric regex
- **SQL injection prevention** - all identifiers validated before use
- **No secrets in code** - .env.local is gitignored
- **File read limits** - capped at 50KB per file to prevent DoS

---

Maintained by [Bunlong Heng](https://www.bunlongheng.com)
