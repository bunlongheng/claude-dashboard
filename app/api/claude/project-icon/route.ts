import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { withErrorHandler } from "@/lib/api-handler";

const SITES_DIR = path.join(os.homedir(), "Sites");
const LOCAL_APPS_API = "http://localhost:9876";

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

// Cache local-apps favicon map (refreshes every 5 min)
let faviconCache: Record<string, string> | null = null;
let cacheTime = 0;

async function getFaviconMap(): Promise<Record<string, string>> {
    if (faviconCache && Date.now() - cacheTime < 300000) return faviconCache;
    try {
        const res = await fetch(`${LOCAL_APPS_API}/api/favicons`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) { faviconCache = await res.json(); cacheTime = Date.now(); return faviconCache!; }
    } catch {}
    return faviconCache || {};
}

export const GET = withErrorHandler(async (req: NextRequest) => {
    const project = req.nextUrl.searchParams.get("project");
    if (!project) return new NextResponse(null, { status: 400 });

    const parts = project.replace(/-/g, "/").split("/");
    const name = parts[parts.length - 1];
    if (!name) return new NextResponse(null, { status: 404 });
    // Reject traversal segments ('.', '..') and anything outside a plain
    // project-name charset before touching the filesystem.
    if (name === "." || name === ".." || !/^[A-Za-z0-9_.-]+$/.test(name)) {
        return new NextResponse(null, { status: 400 });
    }

    // 1. Try local filesystem favicon
    const projectDir = path.join(SITES_DIR, name);
    // Containment check: the resolved dir must stay inside SITES_DIR.
    if (!path.resolve(projectDir).startsWith(SITES_DIR + path.sep)) {
        return new NextResponse(null, { status: 400 });
    }
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

    // 2. Try local-apps favicon API
    const map = await getFaviconMap();
    const faviconUrl = map[name];
    if (faviconUrl) {
        try {
            const res = await fetch(`${LOCAL_APPS_API}${faviconUrl}`, { signal: AbortSignal.timeout(2000) });
            if (res.ok) {
                const buf = Buffer.from(await res.arrayBuffer());
                const ct = res.headers.get("content-type") || "image/png";
                return new NextResponse(buf, {
                    headers: { "Content-Type": ct, "Cache-Control": "public, max-age=86400" },
                });
            }
        } catch {}
    }

    return new NextResponse(null, { status: 404 });
}) as (req: NextRequest) => Promise<Response>;
