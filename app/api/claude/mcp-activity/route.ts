import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";

const MCP_API = "http://localhost:9876/api/mcp";
// Fixed set of local-apps MCP endpoints this route may proxy - anything else
// (../, other :9876 routes) is rejected before the upstream URL is built.
const ALLOWED_ENDPOINTS = new Set(["stats", "recent"]);

export const GET = withErrorHandler(async (req: Request) => {
    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get("endpoint") || "stats";
    if (!ALLOWED_ENDPOINTS.has(endpoint)) {
        return NextResponse.json({ error: "unknown endpoint" }, { status: 400 });
    }

    try {
        const res = await fetch(`${MCP_API}/${endpoint}`, { next: { revalidate: 0 } });
        if (!res.ok) return NextResponse.json({ error: `${res.status}` }, { status: res.status });
        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: "MCP API unavailable" }, { status: 503 });
    }
});
