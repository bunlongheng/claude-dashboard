import * as fs from "fs";

// Read a file as UTF-8, returning "" on any error (missing file, perms, etc).
// Shared by the claude/* routes that walk ~/.claude and tolerate absent files.
export function safeRead(p: string): string {
    try {
        return fs.readFileSync(p, "utf-8");
    } catch {
        return "";
    }
}

// Read the last `maxBytes` of a file as UTF-8 (fd tail-read). For big append-only
// logs (session .jsonl) where only the recent tail is needed. Returns "" on error.
// Shared by the token-stats / tool-usage / turns-by-hour scan routes.
export function readLastBytes(filePath: string, maxBytes: number): string {
    let fd = -1;
    try {
        fd = fs.openSync(filePath, "r");
        const size = fs.fstatSync(fd).size;
        const readSize = Math.min(maxBytes, size);
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, Math.max(0, size - readSize));
        return buf.toString("utf-8");
    } catch {
        return "";
    } finally {
        if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ }
    }
}
