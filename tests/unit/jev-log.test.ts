import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { JevRow } from "@/lib/jev-log";

// os is a Node ESM built-in - its namespace export isn't configurable, so
// vi.spyOn can't patch it directly. Route through a mutable override hook
// instead, defaulting to the real implementation (same pattern as
// skill-usage-route.test.ts).
const overrides: { homedir?: typeof os.homedir } = {};

vi.mock("os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("os")>();
    return {
        ...actual,
        homedir: (...args: Parameters<typeof actual.homedir>) =>
            overrides.homedir ? overrides.homedir(...args) : actual.homedir(...args),
    };
});

// Imported after the mock is wired, not statically above it: a static import
// evaluates lib/jev-log (and so calls homedir) before `overrides` exists.
const { parseJevLines, aggregateJev, dayOf, hourOf, JEV_COST_PER_CALL } = await import("@/lib/jev-log");

// ── Fixtures: the 3 row shapes the hook actually writes ─────────────────────
const ROUTED = {
    ts: "2026-09-24T11:48:23-0400", session_id: "sess-a", project: "claude",
    source: "router", model: "typesafe-ai/jev", http: "200", latency_ms: 522,
    prompt: "add a chart to the dashboard", status: "routed", tier: "sonnet",
    conf: 0.92, e2e: 0.89, question: 0.06, input_tokens: 505, output_tokens: 86,
};
const SKIPPED = {
    ts: "2026-09-24T11:49:00-0400", session_id: "sess-a", project: "claude",
    source: "router", status: "skipped", reason: "slash",
    model: "typesafe-ai/jev", prompt: "/skill-doctor",
};
const ERRORED = {
    ts: "2026-09-24T11:49:30-0400", session_id: "sess-b", project: "bheng",
    source: "router", model: "typesafe-ai/jev", http: "401", latency_ms: 131,
    prompt: "fix the footer", status: "error", reason: "TypeError",
    body: "{\"error\":\"unauthorized\"}",
};

const GARBAGE = "this is not json at all";
// A truncated final write - the process died mid-append.
const TRUNCATED = '{"ts": "2026-09-24T11:50:00-0400", "session_id": "sess-c", "stat';

function jsonl(...rows: unknown[]): string {
    return rows.map(r => (typeof r === "string" ? r : JSON.stringify(r))).join("\n");
}

const NOW = Date.parse("2026-09-24T11:50:00-0400");

// ── parseJevLines ───────────────────────────────────────────────────────────
describe("parseJevLines", () => {
    it("parses the 3 row shapes and drops garbage and truncated lines", () => {
        const rows = parseJevLines(jsonl(ROUTED, GARBAGE, SKIPPED, ERRORED, TRUNCATED));
        expect(rows).toHaveLength(3);
        expect(rows.map(r => r.status)).toEqual(["routed", "skipped", "error"]);
    });

    it("ignores blank lines and non-object JSON", () => {
        expect(parseJevLines("\n\n  \n")).toEqual([]);
        expect(parseJevLines(jsonl(42, "null", '"a string"', "[1,2]"))).toEqual([]);
    });

    it("rejects objects without a usable ts", () => {
        expect(parseJevLines(jsonl({ status: "routed" }))).toEqual([]);
        expect(parseJevLines(jsonl({ ts: 12345 }))).toEqual([]);
        expect(parseJevLines(jsonl({ ts: "yesterday" }))).toEqual([]);
    });
});

describe("dayOf", () => {
    it("buckets on the hook's local date, not UTC", () => {
        // 21:30 EDT is already the next day in UTC; the bucket must stay on the
        // day the prompt was actually typed.
        expect(dayOf("2026-09-24T21:30:00-0400")).toBe("2026-09-24");
    });
});

// ── aggregateJev ────────────────────────────────────────────────────────────
describe("aggregateJev totals", () => {
    const agg = aggregateJev([ROUTED, SKIPPED, ERRORED], NOW);

    it("counts each status", () => {
        expect(agg.totals.calls).toBe(3);
        expect(agg.totals.routed).toBe(1);
        expect(agg.totals.skipped).toBe(1);
        expect(agg.totals.errors).toBe(1);
        expect(agg.totals.routedPct).toBe(33.3);
    });

    it("averages latency only over rows that have one", () => {
        // 522 and 131 - the skipped row never called the API.
        expect(agg.totals.avgLatencyMs).toBe(327);
        expect(agg.totals.p95LatencyMs).toBe(522);
    });

    it("sums tokens and prices every call at the flat router rate", () => {
        expect(agg.totals.inputTokens).toBe(505);
        expect(agg.totals.outputTokens).toBe(86);
        expect(agg.totals.estCostUsd).toBeCloseTo(3 * JEV_COST_PER_CALL, 10);
    });

    it("tracks distinct sessions and the last call vs last routed call", () => {
        expect(agg.totals.sessions).toBe(2);
        expect(agg.totals.lastCallTs).toBe(ERRORED.ts);
        expect(agg.totals.lastRoutedTs).toBe(ROUTED.ts);
    });

    it("returns a zeroed shape for no rows", () => {
        const empty = aggregateJev([], NOW);
        expect(empty.totals.calls).toBe(0);
        expect(empty.totals.routedPct).toBe(0);
        expect(empty.totals.avgLatencyMs).toBe(0);
        expect(empty.totals.p95LatencyMs).toBe(0);
        expect(empty.totals.estCostUsd).toBe(0);
        expect(empty.totals.lastCallTs).toBeNull();
        expect(empty.totals.lastRoutedTs).toBeNull();
        expect(empty.daily).toEqual([]);
        expect(empty.sessions).toEqual([]);
        expect(empty.recent).toEqual([]);
    });

    it("treats an unrecognised status as skipped", () => {
        const odd = aggregateJev([{ ts: ROUTED.ts, status: "weird" }], NOW);
        expect(odd.totals.skipped).toBe(1);
        expect(odd.totals.routed).toBe(0);
        expect(odd.totals.errors).toBe(0);
    });

    it("ignores a non-finite latency", () => {
        const rows: JevRow[] = [{ ts: ROUTED.ts, status: "routed", latency_ms: Number.NaN }];
        expect(aggregateJev(rows, NOW).totals.avgLatencyMs).toBe(0);
    });

    it("sorts unordered input before reading first and last", () => {
        const agg2 = aggregateJev([ERRORED, ROUTED, SKIPPED], NOW);
        expect(agg2.totals.lastCallTs).toBe(ERRORED.ts);
        expect(agg2.recent[0].ts).toBe(ERRORED.ts);
    });
});

// ── health ──────────────────────────────────────────────────────────────────
describe("aggregateJev health", () => {
    it("is live when a routed row landed inside 15 minutes", () => {
        expect(aggregateJev([ROUTED], Date.parse("2026-09-24T11:58:00-0400")).health).toBe("live");
    });

    it("is stale once the last routed row is older than 15 minutes", () => {
        expect(aggregateJev([ROUTED], Date.parse("2026-09-24T13:00:00-0400")).health).toBe("stale");
        expect(aggregateJev([ROUTED], Date.parse("2026-09-30T13:00:00-0400")).health).toBe("stale");
    });

    it("is never when nothing has routed, even with skipped and errored rows", () => {
        expect(aggregateJev([SKIPPED, ERRORED], NOW).health).toBe("never");
        expect(aggregateJev([], NOW).health).toBe("never");
    });
});

// ── tiers ───────────────────────────────────────────────────────────────────
describe("aggregateJev tiers", () => {
    it("counts each tier over routed rows only", () => {
        const rows: JevRow[] = [
            { ts: "2026-09-24T10:00:00-0400", status: "routed", tier: "haiku" },
            { ts: "2026-09-24T10:01:00-0400", status: "routed", tier: "sonnet" },
            { ts: "2026-09-24T10:02:00-0400", status: "routed", tier: "sonnet" },
            { ts: "2026-09-24T10:03:00-0400", status: "routed", tier: "opus" },
            { ts: "2026-09-24T10:04:00-0400", status: "routed", tier: "fable" },
            // A tier on a non-routed row must not be counted.
            { ts: "2026-09-24T10:05:00-0400", status: "skipped", tier: "opus" },
        ];
        expect(aggregateJev(rows, NOW).tiers).toEqual({ haiku: 1, sonnet: 2, opus: 1, fable: 1 });
    });

    it("ignores a tier outside the ladder", () => {
        const rows: JevRow[] = [{ ts: ROUTED.ts, status: "routed", tier: "gpt" }];
        expect(aggregateJev(rows, NOW).tiers).toEqual({ haiku: 0, sonnet: 0, opus: 0, fable: 0 });
    });
});

// ── daily ───────────────────────────────────────────────────────────────────
describe("aggregateJev daily", () => {
    it("buckets by local day across a day boundary and keeps them ascending", () => {
        const rows: JevRow[] = [
            { ts: "2026-09-24T23:50:00-0400", status: "routed", tier: "haiku", latency_ms: 100, input_tokens: 10, output_tokens: 5 },
            { ts: "2026-09-25T00:10:00-0400", status: "routed", tier: "haiku", latency_ms: 300, input_tokens: 20, output_tokens: 7 },
            { ts: "2026-09-25T00:20:00-0400", status: "skipped", reason: "short" },
            { ts: "2026-09-25T00:30:00-0400", status: "error", latency_ms: 900 },
        ];
        const { daily } = aggregateJev(rows, Date.parse("2026-09-25T01:00:00-0400"));
        expect(daily.map(d => d.day)).toEqual(["2026-09-24", "2026-09-25"]);

        expect(daily[0]).toMatchObject({ routed: 1, skipped: 0, errors: 0, avgLatencyMs: 100, p95LatencyMs: 100, tokens: 15 });
        expect(daily[1]).toMatchObject({ routed: 1, skipped: 1, errors: 1, avgLatencyMs: 600, p95LatencyMs: 900, tokens: 27 });
    });

    it("reports zero latency for a day with only skipped rows", () => {
        const { daily } = aggregateJev([SKIPPED], NOW);
        expect(daily[0].avgLatencyMs).toBe(0);
        expect(daily[0].p95LatencyMs).toBe(0);
    });
});

// ── hourly ──────────────────────────────────────────────────────────────────
describe("hourOf", () => {
    it("keeps the local hour the hook wrote, offset and all", () => {
        expect(hourOf("2026-09-24T14:48:23-0400")).toBe("2026-09-24T14");
        expect(hourOf("2026-09-24T00:05:00-0400")).toBe("2026-09-24T00");
    });
});

describe("aggregateJev hourly", () => {
    // The window is built from the clock in local time, so the fixtures are
    // written the way the hook writes them - local, with the real offset - and
    // the suite passes in any zone rather than only in -0400.
    function localTs(ms: number): string {
        const d = new Date(ms);
        const p = (n: number) => String(n).padStart(2, "0");
        const off = -d.getTimezoneOffset();
        const sign = off < 0 ? "-" : "+";
        const abs = Math.abs(off);
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`
            + `${sign}${p(Math.floor(abs / 60))}${p(abs % 60)}`;
    }

    const HOUR = 60 * 60 * 1000;

    it("always returns exactly 24 buckets ending at the current hour", () => {
        const { hourly } = aggregateJev([], NOW);
        expect(hourly).toHaveLength(24);
        expect(hourly[23].hour).toBe(hourOf(localTs(NOW)));
    });

    it("zero-fills the quiet hours instead of dropping them", () => {
        const rows: JevRow[] = [
            { ts: localTs(NOW), status: "routed", tier: "haiku", latency_ms: 100, input_tokens: 10, output_tokens: 5 },
        ];
        const { hourly } = aggregateJev(rows, NOW);
        expect(hourly).toHaveLength(24);
        expect(hourly[23]).toMatchObject({ routed: 1, skipped: 0, errors: 0, avgLatencyMs: 100, tokens: 15 });
        expect(hourly.slice(0, 23).every(h => h.routed === 0 && h.skipped === 0 && h.errors === 0)).toBe(true);
    });

    it("splits outcomes into the hour each prompt landed in", () => {
        const rows: JevRow[] = [
            { ts: localTs(NOW - 2 * HOUR), status: "routed", tier: "sonnet", latency_ms: 200 },
            { ts: localTs(NOW - 2 * HOUR), status: "error", latency_ms: 400 },
            { ts: localTs(NOW - 1 * HOUR), status: "skipped", reason: "slash" },
        ];
        const { hourly } = aggregateJev(rows, NOW);
        expect(hourly[21]).toMatchObject({ routed: 1, skipped: 0, errors: 1, avgLatencyMs: 300 });
        expect(hourly[22]).toMatchObject({ routed: 0, skipped: 1, errors: 0, avgLatencyMs: 0 });
    });

    it("drops rows older than the 24 hour window from the buckets", () => {
        const rows: JevRow[] = [
            { ts: localTs(NOW - 40 * HOUR), status: "routed", tier: "opus" },
        ];
        const { hourly, totals } = aggregateJev(rows, NOW);
        expect(totals.routed).toBe(1);
        expect(hourly.reduce((s, h) => s + h.routed, 0)).toBe(0);
    });

    it("labels each bucket with its zero-padded hour", () => {
        const { hourly } = aggregateJev([], NOW);
        for (const h of hourly) {
            expect(h.label).toBe(`${h.hour.slice(11)}:00`);
            expect(h.label).toMatch(/^\d{2}:00$/);
        }
    });
});

// ── sessions ────────────────────────────────────────────────────────────────
describe("aggregateJev sessions", () => {
    const rows: JevRow[] = [
        { ts: "2026-09-24T09:00:00-0400", session_id: "s1", project: "claude", status: "routed", tier: "sonnet", conf: 0.9 },
        { ts: "2026-09-24T09:05:00-0400", session_id: "s1", project: "claude", status: "routed", tier: "sonnet", conf: 0.7 },
        { ts: "2026-09-24T09:06:00-0400", session_id: "s1", project: "claude", status: "skipped" },
        { ts: "2026-09-24T10:00:00-0400", session_id: "s2", project: "bheng", status: "error" },
    ];

    it("groups by session id, newest last-seen first", () => {
        const { sessions } = aggregateJev(rows, NOW);
        expect(sessions.map(s => s.session_id)).toEqual(["s2", "s1"]);
    });

    it("counts messages and outcomes per session", () => {
        const s1 = aggregateJev(rows, NOW).sessions.find(s => s.session_id === "s1")!;
        expect(s1).toMatchObject({
            project: "claude", messages: 3, routed: 2, skipped: 1, errors: 0,
            topTier: "sonnet", firstTs: "2026-09-24T09:00:00-0400", lastTs: "2026-09-24T09:06:00-0400",
        });
        expect(s1.avgConf).toBe(0.8);
    });

    it("leaves topTier and avgConf null when the router never answered", () => {
        const s2 = aggregateJev(rows, NOW).sessions.find(s => s.session_id === "s2")!;
        expect(s2.topTier).toBeNull();
        expect(s2.avgConf).toBeNull();
        expect(s2.errors).toBe(1);
    });

    it("picks the most frequent tier as topTier", () => {
        const mixed: JevRow[] = [
            { ts: "2026-09-24T09:00:00-0400", session_id: "s3", status: "routed", tier: "haiku" },
            { ts: "2026-09-24T09:01:00-0400", session_id: "s3", status: "routed", tier: "opus" },
            { ts: "2026-09-24T09:02:00-0400", session_id: "s3", status: "routed", tier: "opus" },
        ];
        expect(aggregateJev(mixed, NOW).sessions[0].topTier).toBe("opus");
    });

    it("falls back to unknown for a row with no session or project", () => {
        const { sessions } = aggregateJev([{ ts: ROUTED.ts, status: "routed", tier: "haiku" }], NOW);
        expect(sessions[0].session_id).toBe("unknown");
        expect(sessions[0].project).toBe("unknown");
    });
});

// ── recent ──────────────────────────────────────────────────────────────────
describe("aggregateJev recent", () => {
    it("returns at most the last 200 rows, newest first", () => {
        const rows: JevRow[] = Array.from({ length: 250 }, (_, i) => ({
            ts: new Date(Date.parse("2026-09-01T00:00:00-0400") + i * 60_000).toISOString(),
            status: "routed", tier: "haiku",
        }));
        const { recent } = aggregateJev(rows, NOW);
        expect(recent).toHaveLength(200);
        expect(Date.parse(recent[0].ts)).toBeGreaterThan(Date.parse(recent[199].ts));
        expect(recent[0].ts).toBe(rows[249].ts);
    });
});

// ── readJevLog ──────────────────────────────────────────────────────────────
// JEV_LOG_PATH is computed once at module load from os.homedir(), so each test
// needs a fresh module instance to pick up its own tmpHome override.
async function loadLib() {
    vi.resetModules();
    return import("@/lib/jev-log");
}

function writeLog(tmpHome: string, body: string) {
    const dir = path.join(tmpHome, ".claude", "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "jev.jsonl"), body);
}

describe("readJevLog", () => {
    let tmpHome: string;

    beforeEach(() => {
        tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "jev-test-"));
        overrides.homedir = () => tmpHome;
    });

    afterEach(() => {
        delete overrides.homedir;
        fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    it("returns [] when the log file does not exist", async () => {
        const { readJevLog } = await loadLib();
        expect(readJevLog(30)).toEqual([]);
    });

    it("points at ~/.claude/logs/jev.jsonl and the hook that writes it", async () => {
        const { JEV_LOG_PATH, JEV_HOOK_PATH } = await loadLib();
        expect(JEV_LOG_PATH).toBe(path.join(tmpHome, ".claude", "logs", "jev.jsonl"));
        expect(JEV_HOOK_PATH).toBe(path.join(tmpHome, ".claude", "hooks", "jev-router.sh"));
    });

    it("reads real rows and skips the garbage and truncated ones", async () => {
        const fresh = { ...ROUTED, ts: new Date().toISOString() };
        writeLog(tmpHome, jsonl(fresh, GARBAGE, TRUNCATED));
        const { readJevLog } = await loadLib();
        const rows = readJevLog(30);
        expect(rows).toHaveLength(1);
        expect(rows[0].tier).toBe("sonnet");
    });

    it("filters to the requested window and sorts ascending", async () => {
        const now = Date.now();
        const recent = { ...ROUTED, ts: new Date(now - 60_000).toISOString(), session_id: "recent" };
        const older = { ...ROUTED, ts: new Date(now - 3 * 86_400_000).toISOString(), session_id: "older" };
        const ancient = { ...ROUTED, ts: new Date(now - 90 * 86_400_000).toISOString(), session_id: "ancient" };
        writeLog(tmpHome, jsonl(ancient, recent, older));

        const { readJevLog } = await loadLib();
        expect(readJevLog(7).map(r => r.session_id)).toEqual(["older", "recent"]);
        expect(readJevLog(1).map(r => r.session_id)).toEqual(["recent"]);
        expect(readJevLog().map(r => r.session_id)).toEqual(["older", "recent"]);
    });
});
