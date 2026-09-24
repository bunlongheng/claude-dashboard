import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Same os.homedir override as jev-log.test.ts - the lib computes its paths at
// module load, so each test reloads it against a fresh tmp home.
const overrides: { homedir?: typeof os.homedir } = {};

vi.mock("os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("os")>();
    return {
        ...actual,
        homedir: (...args: Parameters<typeof actual.homedir>) =>
            overrides.homedir ? overrides.homedir(...args) : actual.homedir(...args),
    };
});

let tmpHome: string;

function loadLib() {
    vi.resetModules();
    return import("@/lib/jev-router-state");
}
function loadRoute() {
    vi.resetModules();
    return import("@/app/api/claude/jev/router/route");
}
function writeSettings(obj: unknown) {
    fs.writeFileSync(path.join(tmpHome, ".claude", "settings.json"), JSON.stringify(obj));
}

beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "jev-router-"));
    fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
    overrides.homedir = () => tmpHome;
});
afterEach(() => {
    delete overrides.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("getRouterState", () => {
    it("defaults to Jev-decides with stock models when nothing exists yet", async () => {
        const { getRouterState, JEV_STATE_PATH } = await loadLib();
        expect(getRouterState()).toEqual({
            force: null, mainModel: "default", subagentModel: "sonnet", statePath: JEV_STATE_PATH,
        });
    });

    it("reads the forced tier and the session models from settings.json", async () => {
        writeSettings({ model: "claude-fable-5-1[1m]", env: { CLAUDE_CODE_SUBAGENT_MODEL: "fable" } });
        fs.writeFileSync(path.join(tmpHome, ".claude", "jev-router.json"), '{"force":"opus"}');
        const { getRouterState } = await loadLib();
        const s = getRouterState();
        expect(s.force).toBe("opus");
        expect(s.mainModel).toBe("claude-fable-5-1[1m]");
        expect(s.subagentModel).toBe("fable");
    });

    it("treats a bad tier, a non-object file, or corrupt JSON as Jev-decides", async () => {
        const file = path.join(tmpHome, ".claude", "jev-router.json");
        const { getRouterState } = await loadLib();
        fs.writeFileSync(file, '{"force":"gpt"}');
        expect(getRouterState().force).toBeNull();
        fs.writeFileSync(file, "[1,2]");
        expect(getRouterState().force).toBeNull();
        fs.writeFileSync(file, "{not json");
        expect(getRouterState().force).toBeNull();
        writeSettings({ env: "nope" });
        expect(getRouterState().subagentModel).toBe("sonnet");
    });
});

describe("setRouterForce", () => {
    it("writes the file, creating the dir, and reads back the new state", async () => {
        fs.rmSync(path.join(tmpHome, ".claude"), { recursive: true });
        const { setRouterForce, JEV_STATE_PATH } = await loadLib();
        expect(setRouterForce("fable").force).toBe("fable");
        expect(JSON.parse(fs.readFileSync(JEV_STATE_PATH, "utf8"))).toEqual({ force: "fable" });
        expect(setRouterForce(null).force).toBeNull();
    });
});

describe("/api/claude/jev/router", () => {
    it("GET returns the state", async () => {
        const { GET } = await loadRoute();
        const res = await GET(new Request("http://x/api/claude/jev/router"), {});
        expect(res.status).toBe(200);
        expect((await res.json()).force).toBeNull();
    });

    it("PUT flips the switch both ways", async () => {
        const { PUT } = await loadRoute();
        const put = (body: string) => PUT(new Request("http://x/api/claude/jev/router", { method: "PUT", body }), {});
        let res = await put('{"force":"haiku"}');
        expect(res.status).toBe(200);
        expect((await res.json()).force).toBe("haiku");
        res = await put('{"force":null}');
        expect((await res.json()).force).toBeNull();
    });

    it("PUT rejects a tier off the ladder, a missing field, and a non-JSON body", async () => {
        const { PUT } = await loadRoute();
        const put = (body: string) => PUT(new Request("http://x/api/claude/jev/router", { method: "PUT", body }), {});
        expect((await put('{"force":"gpt-4"}')).status).toBe(400);
        expect((await put('{}')).status).toBe(400);
        expect((await put('nope')).status).toBe(400);
    });
});
