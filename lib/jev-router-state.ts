import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { JEV_TIERS, type JevTier } from "./jev-log";

// The router's on/off switch. ~/.claude/hooks/jev-router.sh reads this file on
// every prompt, so a change here lands on the next message in every running
// session - unlike settings.json env, which only loads at startup.
export const JEV_STATE_PATH = path.join(os.homedir(), ".claude", "jev-router.json");
const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");

export interface JevRouterState {
    // null = Jev decides per prompt; a tier = every prompt is pinned to it.
    force: JevTier | null;
    // What the session runs on either way, straight from settings.json.
    mainModel: string;
    subagentModel: string;
    statePath: string;
}

function readJson(p: string): Record<string, unknown> {
    try {
        const parsed: unknown = JSON.parse(fs.readFileSync(p, "utf8"));
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

export function isJevTier(v: unknown): v is JevTier {
    return typeof v === "string" && (JEV_TIERS as readonly string[]).includes(v);
}

export function getRouterState(): JevRouterState {
    const state = readJson(JEV_STATE_PATH);
    const settings = readJson(SETTINGS_PATH);
    const env = (settings.env && typeof settings.env === "object" ? settings.env : {}) as Record<string, unknown>;
    return {
        force: isJevTier(state.force) ? state.force : null,
        mainModel: typeof settings.model === "string" ? settings.model : "default",
        subagentModel: typeof env.CLAUDE_CODE_SUBAGENT_MODEL === "string" ? env.CLAUDE_CODE_SUBAGENT_MODEL : "sonnet",
        statePath: JEV_STATE_PATH,
    };
}

export function setRouterForce(force: JevTier | null): JevRouterState {
    fs.mkdirSync(path.dirname(JEV_STATE_PATH), { recursive: true });
    fs.writeFileSync(JEV_STATE_PATH, JSON.stringify({ force }) + "\n");
    return getRouterState();
}
