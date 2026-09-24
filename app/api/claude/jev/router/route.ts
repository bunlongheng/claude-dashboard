import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { getRouterState, setRouterForce, isJevTier } from "@/lib/jev-router-state";

export const dynamic = "force-dynamic";

// Never cached: the switch has to read back exactly what was just written.
export const GET = withErrorHandler(async () => NextResponse.json(getRouterState()));

export const PUT = withErrorHandler(async (req: Request) => {
    const body: unknown = await req.json().catch(() => null);
    const force = body && typeof body === "object" ? (body as { force?: unknown }).force : undefined;
    if (force !== null && !isJevTier(force)) {
        return NextResponse.json({ error: "force must be null or one of haiku, sonnet, opus, fable" }, { status: 400 });
    }
    return NextResponse.json(setRouterForce(force));
});
