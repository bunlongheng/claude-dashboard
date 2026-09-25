import { describe, it, expect } from "vitest";
import * as os from "os";
import * as path from "path";
import { projectFoldersFor } from "@/lib/live-sessions";

const home = os.homedir();
const projects = path.join(home, ".claude", "projects");

describe("projectFoldersFor", () => {
    it("maps a real-path cwd back to the ~/Sites spelling Claude Code used", () => {
        const folders = projectFoldersFor("/Volumes/4TB/Sites/claude", ["/Volumes/4TB/Sites"]);
        expect(folders).toContain(path.join(projects, "-Volumes-4TB-Sites-claude"));
        expect(folders).toContain(path.join(projects, `${home}/Sites/claude`.replace(/\//g, "-")));
    });

    it("leaves a cwd outside every alias alone", () => {
        expect(projectFoldersFor("/opt/thing", ["/Volumes/4TB/Sites"])).toEqual([path.join(projects, "-opt-thing")]);
    });
});
