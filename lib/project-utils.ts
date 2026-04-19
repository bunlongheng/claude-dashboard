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
    // Convert to path, take last segment after "Sites/" or last 1-2 segments
    const fullPath = folderToPath(folder);
    const sitesIdx = fullPath.lastIndexOf("/Sites/");
    if (sitesIdx >= 0) {
        return fullPath.slice(sitesIdx + 7); // everything after "/Sites/"
    }
    const parts = fullPath.split("/").filter(Boolean);
    return parts[parts.length - 1] || folder;
}

/**
 * Check if a Claude project folder maps to a real local git repo.
 */
export function isRealRepo(folder: string): boolean {
    const projectPath = folderToPath(folder);
    try {
        // Must be a local directory that exists AND has .git
        if (!fs.existsSync(projectPath)) return false;
        if (!fs.statSync(projectPath).isDirectory()) return false;
        return fs.existsSync(path.join(projectPath, ".git"));
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
