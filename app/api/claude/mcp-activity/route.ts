import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";

const MCP_API = "http://localhost:9876/api/mcp";

export const GET = withErrorHandler(async (req: Request) => {
    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get("endpoint") || "stats";

    try {
        const res = await fetch(`${MCP_API}/${endpoint}`, { next: { revalidate: 0 } });
        if (!res.ok) return NextResponse.json({ error: `${res.status}` }, { status: res.status });
        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: "MCP API unavailable" }, { status: 503 });
    }
});
