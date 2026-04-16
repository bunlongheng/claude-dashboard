import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CLAUDE_MD_PATH = path.join(os.homedir(), ".claude", "CLAUDE.md");

function getDb() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Database = require("better-sqlite3");
        const dbPath = process.env.SQLITE_PATH || path.join(os.homedir(), ".claude", "dashboard.db");
        const db = new Database(dbPath);
        db.pragma("journal_mode = WAL");
        return db;
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const versionId = searchParams.get("id");
    const diffId = searchParams.get("diff");

    const db = getDb();
    if (!db) {
        return NextResponse.json({ error: "Database not available" }, { status: 501 });
    }

    try {
        // Ensure table exists
        db.exec(`
            CREATE TABLE IF NOT EXISTS claude_md_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                hash TEXT NOT NULL,
                size INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_claude_md_hash ON claude_md_versions(hash);
        `);

        // Return a specific version's content
        if (versionId) {
            const row = db.prepare("SELECT id, content, hash, size, created_at FROM claude_md_versions WHERE id = ?").get(Number(versionId));
            db.close();
            if (!row) return NextResponse.json({ error: "Version not found" }, { status: 404 });
            return NextResponse.json({ version: row });
        }

        // Read current file
        let currentContent = "";
        try {
            currentContent = fs.readFileSync(CLAUDE_MD_PATH, "utf-8");
        } catch {
            db.close();
            return NextResponse.json({ error: "CLAUDE.md not found" }, { status: 404 });
        }

        const currentHash = crypto.createHash("md5").update(currentContent).digest("hex");
        const currentSize = Buffer.byteLength(currentContent, "utf-8");

        // Return diff data: version content + current content
        if (diffId) {
            const row = db.prepare("SELECT id, content, hash, size, created_at FROM claude_md_versions WHERE id = ?").get(Number(diffId));
            db.close();
            if (!row) return NextResponse.json({ error: "Version not found" }, { status: 404 });
            return NextResponse.json({
                version: row,
                current: { content: currentContent, hash: currentHash, size: currentSize },
            });
        }

        // Check if current content already matches latest version
        const latest = db.prepare("SELECT hash FROM claude_md_versions ORDER BY id DESC LIMIT 1").get() as { hash: string } | undefined;

        if (!latest || latest.hash !== currentHash) {
            db.prepare("INSERT INTO claude_md_versions (content, hash, size) VALUES (?, ?, ?)").run(currentContent, currentHash, currentSize);
        }

        // Get all versions (metadata only)
        const versions = db.prepare("SELECT id, hash, size, created_at FROM claude_md_versions ORDER BY id DESC").all();
        const total = versions.length;

        db.close();

        return NextResponse.json({
            current: { content: currentContent, hash: currentHash, size: currentSize },
            versions,
            total,
        });
    } catch (err) {
        try { db.close(); } catch {}
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
