import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const SITES_DIR = path.join(os.homedir(), "Sites");

const FAVICON_PATHS = [
    "app/favicon.ico",
    "app/icon.png",
    "public/favicon.ico",
    "public/favicon.svg",
    "public/favicon.png",
];

const MIME: Record<string, string> = {
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".svg": "image/svg+xml",
};

export async function GET(req: NextRequest) {
    const project = req.nextUrl.searchParams.get("project");
    if (!project) return new NextResponse(null, { status: 400 });

    // Extract project name from folder like "-Users-alice-Sites-myapp"
    const parts = project.replace(/-/g, "/").split("/");
    const name = parts[parts.length - 1];
    if (!name) return new NextResponse(null, { status: 404 });

    const projectDir = path.join(SITES_DIR, name);

    for (const rel of FAVICON_PATHS) {
        const fp = path.join(projectDir, rel);
        try {
            if (fs.statSync(fp).isFile()) {
                const ext = path.extname(fp);
                const buf = fs.readFileSync(fp);
                return new NextResponse(buf, {
                    headers: {
                        "Content-Type": MIME[ext] ?? "application/octet-stream",
                        "Cache-Control": "public, max-age=86400",
                    },
                });
            }
        } catch {}
    }

    return new NextResponse(null, { status: 404 });
}
