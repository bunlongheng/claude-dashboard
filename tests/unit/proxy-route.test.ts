import { describe, it, expect, vi, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server";

// Behavioral tests for app/api/proxy/route.ts - the same-origin reverse proxy
// the machine switcher uses. Peers are stubbed with MSW so nothing leaves the
// process; tests/setup.ts fails any request that reaches an unhandled URL.

const SAME_SITE = { "sec-fetch-site": "same-origin", host: "localhost:3003", origin: "http://localhost:3003" };
const FOREIGN = { "sec-fetch-site": "cross-site", host: "localhost:3003", origin: "https://evil.example" };
const originalMachines = process.env.MACHINES;

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/proxy/route");
}

function get(query: string, headers: Record<string, string> = SAME_SITE) {
  return new Request(`http://localhost/api/proxy?${query}`, { headers });
}

afterEach(() => {
  if (originalMachines === undefined) delete process.env.MACHINES;
  else process.env.MACHINES = originalMachines;
});

describe("GET /api/proxy", () => {
  it("returns 403 for a foreign-Origin caller", async () => {
    process.env.MACHINES = "10.0.0.2:3003";
    const { GET } = await loadRoute();
    const res = await GET(get("machine=10.0.0.2:3003&path=/api/claude/lan", FOREIGN));
    expect(res.status).toBe(403);
  });

  it("returns 400 when machine or path is missing", async () => {
    const { GET } = await loadRoute();
    expect((await GET(get("path=/api/claude/lan"))).status).toBe(400);
    expect((await GET(get("machine=10.0.0.2:3003"))).status).toBe(400);
  });

  it("returns 400 for a path outside the /api/claude and /api/rag allowlist", async () => {
    process.env.MACHINES = "10.0.0.2:3003";
    const { GET } = await loadRoute();
    for (const p of ["/api/proxy", "/api/qr", "/etc/passwd", "//api/claude/lan"]) {
      const res = await GET(get(`machine=10.0.0.2:3003&path=${encodeURIComponent(p)}`));
      expect(res.status, p).toBe(400);
    }
  });

  it("returns 404 for a machine that is not in MACHINES", async () => {
    process.env.MACHINES = "10.0.0.2:3003";
    const { GET } = await loadRoute();
    const res = await GET(get("machine=10.0.0.99:3003&path=/api/claude/lan"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown machine" });
  });

  it("forwards an allowed GET to the peer and relays status + body", async () => {
    process.env.MACHINES = "10.0.0.2:3003";
    server.use(http.get("http://10.0.0.2:3003/api/claude/lan", () => HttpResponse.json({ hostname: "pi5" })));
    const { GET } = await loadRoute();
    const res = await GET(get("machine=10.0.0.2:3003&path=/api/claude/lan"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ hostname: "pi5" });
  });

  it("resolves a machine by bare ip and relays a non-200 peer status", async () => {
    process.env.MACHINES = "10.0.0.2:3003";
    server.use(http.get("http://10.0.0.2:3003/api/rag/stats", () => HttpResponse.json({ error: "nope" }, { status: 503 })));
    const { GET } = await loadRoute();
    const res = await GET(get("machine=10.0.0.2&path=/api/rag/stats"));
    expect(res.status).toBe(503);
  });

  it("returns 502 when the peer is unreachable", async () => {
    process.env.MACHINES = "10.0.0.2:3003";
    server.use(http.get("http://10.0.0.2:3003/api/claude/lan", () => HttpResponse.error()));
    const { GET } = await loadRoute();
    const res = await GET(get("machine=10.0.0.2:3003&path=/api/claude/lan"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "peer unreachable" });
  });
});

describe("POST /api/proxy", () => {
  it("forwards the body and content-type to the peer", async () => {
    process.env.MACHINES = "10.0.0.2:3003";
    let seen: { body: string; ct: string | null } | null = null;
    server.use(http.post("http://10.0.0.2:3003/api/claude/skills", async ({ request }) => {
      seen = { body: await request.text(), ct: request.headers.get("content-type") };
      return HttpResponse.json({ ok: true });
    }));
    const { POST } = await loadRoute();
    const res = await POST(new Request("http://localhost/api/proxy?machine=10.0.0.2:3003&path=/api/claude/skills", {
      method: "POST",
      headers: { ...SAME_SITE, "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    }));
    expect(res.status).toBe(200);
    expect(seen).toEqual({ body: '{"a":1}', ct: "application/json" });
  });

  it("returns 403 for a foreign-Origin POST", async () => {
    process.env.MACHINES = "10.0.0.2:3003";
    const { POST } = await loadRoute();
    const res = await POST(new Request("http://localhost/api/proxy?machine=10.0.0.2:3003&path=/api/claude/skills", {
      method: "POST", headers: FOREIGN, body: "{}",
    }));
    expect(res.status).toBe(403);
  });
});
