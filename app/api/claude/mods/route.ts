import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { scanMods, scanMarketplaces } from "@/lib/mods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => NextResponse.json({ mods: scanMods(), marketplaces: scanMarketplaces() }));
