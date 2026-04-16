/**
 * Check if a request is coming from a local/development environment.
 * Matches: localhost, 127.0.0.1, 10.x, 100.x (Tailscale), 172.16-31, 192.168.x, *.localhost
 * Used to bypass auth checks in local/LAN development while keeping auth in production.
 */

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|100\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|.*\.localhost)(:\d+)?$/;

/** For middleware / route handlers where you have the Request object */
export function isLocal(request: Request): boolean {
    const host = request.headers.get("host") || "";
    return LOCAL_HOST_RE.test(host);
}

/** For server actions / server components where you only have headers() */
export function isLocalHost(host: string): boolean {
    return LOCAL_HOST_RE.test(host);
}
