import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Convert a Claude project folder name to a directory path.
 * "-Users-bheng-Sites-stickies" -> "/Users/bheng/Sites/stickies"
 */
export function folderToPath(folder: string): string {
    return folder.replace(/-/g, "/");
}

/**
 * Extract project name from folder - uses last meaningful segment.
 * "-Users-bheng-Sites-local-apps" -> "local-apps"
 * "-Users-bheng-Sites-bheng" -> "bheng"
 */
export function folderToName(folder: string): string {
    // Find "Sites" in the folder, return everything after it
    const sitesIdx = folder.indexOf("-Sites-");
    if (sitesIdx >= 0) {
        const after = folder.slice(sitesIdx + 7); // after "-Sites-"
        // Check if the hyphenated name exists as a real directory
        const sitesDir = folder.slice(0, sitesIdx + 6).replace(/-/g, "/"); // e.g. /Users/bheng/Sites
        if (fs.existsSync(path.join(sitesDir, after))) return after;
        // Try with hyphens as path separators for nested dirs
        return after;
    }
    const parts = folder.replace(/^-/, "").split("-");
    return parts[parts.length - 1] || folder;
}

/**
 * Check if a Claude project folder maps to a real local directory.
 * Accepts any local directory (git repo or not), rejects remote/non-existent paths.
 */
export function isRealRepo(folder: string): boolean {
    const projectPath = folderToPath(folder);
    try {
        if (!fs.existsSync(projectPath)) return false;
        return fs.statSync(projectPath).isDirectory();
    } catch {
        return false;
    }
}

/**
 * Get valid project folders from ~/.claude/projects/ (only real local git repos).
 */
export function getProjectFolders(): string[] {
    const projectsDir = path.join(os.homedir(), ".claude", "projects");
    try {
        return fs.readdirSync(projectsDir).filter(f => {
            const fullPath = path.join(projectsDir, f);
            try {
                if (!fs.statSync(fullPath).isDirectory()) return false;
            } catch { return false; }
            return isRealRepo(f);
        });
    } catch {
        return [];
    }
}
