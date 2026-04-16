import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

function dirExists(p: string): boolean {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function folderToName(folder: string): string {
    return folder.replace(/-/g, "/").split("/").pop() ?? folder;
}

// Read only enough bytes to extract frontmatter (first ~512 bytes is plenty)
function readFrontmatterType(filePath: string): string | null {
    let fd = -1;
    try {
        fd = fs.openSync(filePath, "r");
        const buf = Buffer.alloc(512);
        const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
        const text = buf.subarray(0, bytesRead).toString("utf-8");
        if (!text.startsWith("---")) return null;
        const end = text.indexOf("---", 3);
        if (end === -1) return null;
        const fm = text.slice(3, end);
        const match = fm.match(/^type:\s*(.+)/m);
        return match ? match[1].trim() : null;
    } catch { return null; }
    finally { if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ } }
}

interface TimelineEntry {
    file: string;
    project: string;
    createdAt: string;
    updatedAt: string;
    size: number;
    type: string | null;
}

export async function GET() {
    if (!dirExists(PROJECTS_DIR)) {
        return NextResponse.json({ timeline: [] });
    }

    const timeline: TimelineEntry[] = [];

    for (const folder of fs.readdirSync(PROJECTS_DIR)) {
        const memDir = path.join(PROJECTS_DIR, folder, "memory");
        if (!dirExists(memDir)) continue;

        const project = folderToName(folder);

        let files: string[];
        try {
            files = fs.readdirSync(memDir).filter(f => f.endsWith(".md"));
        } catch { continue; }

        for (const file of files) {
            const fp = path.join(memDir, file);
            try {
                const stat = fs.statSync(fp);
                const type = readFrontmatterType(fp);
                timeline.push({
                    file: file.replace(/\.md$/, ""),
                    project,
                    createdAt: stat.birthtime.toISOString(),
                    updatedAt: stat.mtime.toISOString(),
                    size: stat.size,
                    type,
                });
            } catch { /* skip unreadable files */ }
        }
    }

    // Sort by modified time descending
    timeline.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return NextResponse.json({ timeline });
}
