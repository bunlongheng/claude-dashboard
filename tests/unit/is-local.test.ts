import { describe, it, expect } from "vitest";
import { isLocal, isLocalHost } from "@/lib/is-local";

// Hosts the regex must treat as local (auth bypass)
const LOCAL_HOSTS = [
  "localhost",
  "localhost:3003",
  "127.0.0.1",
  "127.0.0.1:3000",
  "10.0.0.5",
  "10.1.2.3:8080",
  "100.64.1.2", // tailscale CGNAT range
  "100.115.92.1:3003",
  "172.16.0.1",
  "172.20.5.5",
  "172.31.255.255",
  "172.16.0.1:443",
  "192.168.1.100",
  "192.168.0.1:3003",
  "myapp.localhost",
  "bheng.localhost:3003",
];

// Hosts that must NOT be treated as local (auth required)
const REMOTE_HOSTS = [
  "",
  "example.com",
  "google.com:443",
  "8.8.8.8",
  "127.0.0.2", // only 127.0.0.1 is allowed verbatim
  "172.15.0.1", // below the 172.16-31 private range
  "172.32.0.1", // above the 172.16-31 private range
  "11.0.0.1",
  "192.169.1.1", // only 192.168 is private
  "10.0.0", // incomplete IPv4
  "100.1.2.3", // 100.0-63.x is publicly routable, not Tailscale CGNAT
  "100.63.255.255", // just below the 100.64/10 CGNAT range
  "100.128.0.1", // just above the 100.64/10 CGNAT range
  "100.200.1.1", // publicly routable 100.x
];

describe("isLocalHost", () => {
  LOCAL_HOSTS.forEach((host) => {
    it(`treats "${host}" as local`, () => {
      expect(isLocalHost(host)).toBe(true);
    });
  });

  REMOTE_HOSTS.forEach((host) => {
    it(`treats "${host}" as remote`, () => {
      expect(isLocalHost(host)).toBe(false);
    });
  });
});

describe("isLocal (Request)", () => {
  it("reads the host header and returns true for localhost", () => {
    const req = new Request("http://localhost/api", { headers: { host: "localhost:3003" } });
    expect(isLocal(req)).toBe(true);
  });

  it("returns true for a LAN 192.168 host header", () => {
    const req = new Request("http://x/api", { headers: { host: "192.168.1.50:3003" } });
    expect(isLocal(req)).toBe(true);
  });

  it("returns false for a public host header", () => {
    const req = new Request("http://x/api", { headers: { host: "bunlongheng.com" } });
    expect(isLocal(req)).toBe(false);
  });

  it("returns false when the host header is missing", () => {
    const req = new Request("http://x/api");
    expect(isLocal(req)).toBe(false);
  });
});

