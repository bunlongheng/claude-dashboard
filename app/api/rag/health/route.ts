import { NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/rag-search";
import { withErrorHandler } from "@/lib/api-handler";
export const dynamic = "force-dynamic";
export const GET = withErrorHandler(async () => NextResponse.json(runHealthChecks()));
