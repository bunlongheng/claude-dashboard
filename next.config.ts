import type { NextConfig } from "next";
import { networkInterfaces } from "os";
import { execSync } from "child_process";

// Build the dev-origin allow list: all LAN IPv4 addresses + Tailscale IPs.
// In dev mode (next dev), Next.js' HMR WebSocket rejects any host not on
// this list, which makes the page hang on "Loading..." for LAN/Tailscale
// visitors. Listing the host explicitly here unblocks them.
function buildAllowedDevOrigins(): string[] {
    const origins = new Set<string>(["localhost", "127.0.0.1"]);
    try {
        const ifaces = networkInterfaces();
        for (const list of Object.values(ifaces)) {
            for (const i of list ?? []) {
                if (i.family === "IPv4" && !i.internal) origins.add(i.address);
            }
        }
    } catch { /* ignore */ }
    try {
        const out = execSync("/usr/local/bin/tailscale ip -4 2>/dev/null", { encoding: "utf8", timeout: 1000 }).trim();
        for (const ip of out.split("\n").filter(Boolean)) origins.add(ip);
    } catch { /* tailscale not running */ }
    return [...origins];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  allowedDevOrigins: buildAllowedDevOrigins(),
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "@heroicons/react"],
  },
  // The 12 agent avatars and machine icons never change - cache hard.
  async headers() {
    return [
      {
        source: "/agents/:img",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/machine-icons/:img",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
