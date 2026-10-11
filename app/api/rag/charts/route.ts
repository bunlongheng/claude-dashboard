import { NextResponse } from "next/server";
import { getRagCharts } from "@/lib/rag-charts";
import { withErrorHandler } from "@/lib/api-handler";
export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: Request) => {
    const days = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get("days") || "0", 10) || 0, 0), 3650);
    return NextResponse.json(getRagCharts(days));
});
