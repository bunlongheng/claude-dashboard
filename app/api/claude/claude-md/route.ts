import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const dynamic = "force-dynamic";

export async function GET() {
    // Dynamic path construction prevents Next.js from tracing this file at build time
    const claudeMdPath = path.join(process.cwd(), ["CLAUDE", "md"].join("."));
    try {
        const content = fs.readFileSync(claudeMdPath, "utf-8");
        return NextResponse.json({ content });
    } catch {
        return NextResponse.json({ content: "" });
    }
}
