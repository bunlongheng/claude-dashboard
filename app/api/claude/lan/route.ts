import { NextResponse } from "next/server";
import os from "os";

export const dynamic = "force-dynamic";

export function GET() {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  const port = process.env.PORT || "3000";
  const ip = ips[0] ?? "127.0.0.1";
  const hostname = os.hostname().split(".")[0];
  const model = os.cpus()[0]?.model || "Unknown";

  return NextResponse.json({ ip, port, url: `http://${ip}:${port}`, hostname, model, allIps: ips });
}
