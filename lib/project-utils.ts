import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Convert a Claude project folder name to a directory path.
 * "-Users-alice-Sites-myapp" -> "/Users/alice/Sites/myapp"
 */
export function folderToPath(folder: string): string {
    return folder.replace(/-/g, "/");
}

/**
 * Extract project name from folder - uses last meaningful segment.
 * "-Users-alice-Sites-local-apps" -> "local-apps"
 * "-Users-alice-Sites-myapp" -> "myapp"
 */
export function folderToName(folder: string): string {
    // Find "Sites" in the folder, return everything after it
    const sitesIdx = folder.indexOf("-Sites-");
    if (sitesIdx >= 0) {
        const after = folder.slice(sitesIdx + 7);
        const sitesDir = folder.slice(0, sitesIdx + 6).replace(/-/g, "/");
        if (fs.existsSync(path.join(sitesDir, after))) return after;
        return after;
    }
    // Home directory sessions - show as "~" or custom title from session
    const username = os.userInfo().username;
    if (folder === `-Users-${username}` || folder === `-home-${username}`) return "~";
    // Sites folder itself
    if (folder.endsWith("-Sites")) return "Sites";
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
