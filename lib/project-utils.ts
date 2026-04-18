import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const SITES_DIR = path.join(os.homedir(), "Sites");

/**
 * Convert a Claude project folder name to a directory path.
 * "-Users-bheng-Sites-stickies" -> "/Users/bheng/Sites/stickies"
 */
export function folderToPath(folder: string): string {
    return folder.replace(/-/g, "/");
}

/**
 * Extract project name from folder.
 * "-Users-bheng-Sites-stickies" -> "stickies"
 */
export function folderToName(folder: string): string {
    const parts = folder.replace(/^-/, "").split("-");
    return parts[parts.length - 1] || folder;
}

/**
 * Check if a Claude project folder maps to a real git repo.
 * Returns true only if the actual directory has a .git folder.
 */
export function isRealRepo(folder: string): boolean {
    const projectPath = folderToPath(folder);
    try {
        return fs.existsSync(path.join(projectPath, ".git"));
    } catch {
        return false;
    }
}

/**
 * Get valid project folders from ~/.claude/projects/ (only real git repos).
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
