import * as path from "path";
import * as os from "os";
import { readLastBytes } from "./safe-read";

// Reads the Jev router log - one JSON object per user prompt, appended by
// ~/.claude/hooks/jev-router.sh (a UserPromptSubmit hook). The file is
// append-only and grows forever, so only the tail is ever read and any line
// that does not parse (a truncated final write, a partial flush) is dropped.

export const JEV_LOG_PATH = path.join(os.homedir(), ".claude", "logs", "jev.jsonl");
export const JEV_HOOK_PATH = path.join(os.homedir(), ".claude", "hooks", "jev-router.sh");

// Per-call price of the routing model. The router is deliberately cheap - the
// whole point of the ladder is that deciding costs ~nothing next to the model
// it picks - so the number is small on purpose.
export const JEV_COST_PER_CALL = 0.00002;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB tail
const LIVE_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const HOURLY_WINDOW = 24; // always a full day of buckets, however few are filled

export const JEV_TIERS = ["haiku", "sonnet", "opus", "fable"] as const;
export type JevTier = (typeof JEV_TIERS)[number];
export type JevStatus = "routed" | "skipped" | "error";
export type JevHealth = "live" | "stale" | "never" | "off";

export interface JevRow {
    ts: string;
    session_id?: string;
    project?: string;
    source?: string;
    model?: string;
    http?: string;
    latency_ms?: number;
    prompt?: string;
    status?: string;
    tier?: string;
    conf?: number;
    agent?: string;
    agent_conf?: number;
    // Tier the hook actually told the main model to use after the confidence gate.
    applied?: string;
    // source "agent" only: the PreToolUse shadow check on a subagent launch.
    subagent_type?: string;
    requested?: string;
    floor?: string;
    verdict?: "agree" | "under" | "over" | "unknown";
    e2e?: number;
    question?: number;
    input_tokens?: number;
    output_tokens?: number;
    reason?: string;
    body?: string;
    // source "switch" only: the dashboard toggle moving from one tier to another.
    from?: string | null;
    to?: string | null;
}

// A stretch of time the router was off and every prompt was pinned to 1 tier.
export interface JevWindow {
    from: string;
    to: string | null; // null = still forced right now
    tier: string;
    prompts: number;
    // Rebuilt from the per-prompt "forced:<tier>" lines alone, from before the
    // switch logged its own flips - edges are the first and last prompt, not the click.
    inferred: boolean;
    // Subagent runs started inside the window, by ladder rung of the model they ran on.
    subagents: Record<string, number>;
}

export interface JevTotals {
    calls: number;
    routed: number;
    skipped: number;
    errors: number;
    routedPct: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    inputTokens: number;
    outputTokens: number;
    estCostUsd: number;
    sessions: number;
    lastCallTs: string | null;
    lastRoutedTs: string | null;
}

export interface JevDay {
    day: string;
    routed: number;
    skipped: number;
    errors: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    tokens: number;
    costUsd: number;
}

export interface JevHour {
    hour: string; // "2026-09-24T14", local to the machine that ran the hook
    label: string; // "14:00"
    routed: number;
    skipped: number;
    errors: number;
    avgLatencyMs: number;
    tokens: number;
    costUsd: number;
}

export interface JevSession {
    session_id: string;
    project: string;
    messages: number;
    routed: number;
    skipped: number;
    errors: number;
    topTier: string | null;
    firstTs: string;
    lastTs: string;
    avgConf: number | null;
}

// One routed prompt with Jev's pick and how sure it was. Under 0.5 the hook
// tells the main model to ignore the tier and pick for itself.
export interface JevDecision {
    ts: string;
    session_id?: string;
    project?: string;
    prompt: string;
    tier: string;
    conf: number;
    agent: string;
    agentConf: number;
    // What really ran after this prompt: a subagent on the routed tier
    // (followed), a stronger or weaker one, or none (main model did it).
    // null when no subagent data was passed in.
    outcome: JevOutcome | null;
}

// Shadow check on 1 subagent launch: the model it was launched on against the
// cheapest tier Jev says its task needs.
export interface JevAgentCheck {
    ts: string; project?: string; agent: string; task: string;
    requested: string; floor: string; verdict: string;
}

export type JevOutcome = "followed" | "over" | "under" | "main";

export interface JevAggregate {
    totals: JevTotals;
    health: JevHealth;
    daily: JevDay[];
    hourly: JevHour[];
    tiers: Record<JevTier, number>;
    // Every prompt that ended up on a rung: the routed ones at Jev's pick plus
    // the forced ones at the pinned tier. Slash, short and notification skips
    // have no rung and stay out.
    tiersTotal: Record<JevTier, number>;
    sessions: JevSession[];
    windows: JevWindow[];
    decisions: JevDecision[];
    outcomes: Record<JevOutcome, number>;
    agentChecks: { counts: Record<"agree" | "under" | "over", number>; recent: JevAgentCheck[] };
}

// What /api/claude/jev and the server-side prefetch both hand the page.
export interface JevPayload extends JevAggregate {
    days: number;
    project: string | null;
    projects: string[];
    logPath: string;
    hookPath: string;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

// The hook writes local timestamps with an offset ("2026-09-24T11:50:58-0400"),
// so the first 10 chars are already the day the prompt was typed. Bucketing on
// that string keeps days aligned to the user's clock rather than the server's.
export function dayOf(ts: string): string {
    return ts.slice(0, 10);
}

// Same reasoning one level down: the first 13 chars are the local hour the
// prompt was typed, so "2026-09-24T14" buckets 2pm as 2pm regardless of where
// the dashboard is running.
export function hourOf(ts: string): string {
    return ts.slice(0, 13);
}

// The rows carry local hour keys, so the window they are compared against has
// to be built in local time too - a UTC walk back would offset every bucket.
function localHourKey(ms: number): string {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`;
}

function isRow(v: unknown): v is JevRow {
    if (typeof v !== "object" || v === null) return false;
    const ts = (v as { ts?: unknown }).ts;
    return typeof ts === "string" && /^\d{4}-\d{2}-\d{2}T/.test(ts);
}

// Parse a raw .jsonl chunk into rows, dropping anything unparsable. Exported so
// the aggregator can be exercised against a fixture string with no fs involved.
export function parseJevLines(chunk: string): JevRow[] {
    const rows: JevRow[] = [];
    for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(line); } catch { continue; }
        if (isRow(parsed)) rows.push(parsed);
    }
    return rows;
}

export function readJevLog(days = 30): JevRow[] {
    const chunk = readLastBytes(JEV_LOG_PATH, MAX_BYTES);
    if (!chunk) return [];
    // Calendar days in local time, like the usage mix card: days=1 is since
    // midnight today, 7 is today plus the 6 days before. Never a rolling 24 h,
    // so "today" on every card counts the same hours.
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const cutoff = start.getTime() - (days - 1) * 24 * 60 * 60 * 1000;
    const all = parseJevLines(chunk);
    const rows = all.filter(r => {
        const t = Date.parse(r.ts);
        return Number.isFinite(t) && t >= cutoff;
    });
    // The last switch flip before the window sets the router state at its start,
    // so a router turned off yesterday still reads off today with its real click time.
    const before = all.filter(r => r.source === "switch" && typeof r.to === "string" && Date.parse(r.ts) < cutoff).pop();
    if (before) rows.push(before);
    rows.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    return rows;
}

// ── Aggregation ──────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return Math.round(sorted[Math.max(0, idx)]);
}

function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function statusOf(row: JevRow): JevStatus {
    if (row.status === "routed") return "routed";
    if (row.status === "error") return "error";
    return "skipped";
}

function latencyOf(row: JevRow): number | null {
    return typeof row.latency_ms === "number" && Number.isFinite(row.latency_ms) ? row.latency_ms : null;
}

// Pure: takes rows, returns everything the page needs. No fs, no Date.now()
// beyond the health clock, so a fixture array fully determines the output.
export interface SubagentRun { ts: string; tier: string; session?: string }

function forcedTier(row: JevRow): string | null {
    return row.reason?.startsWith("forced:") ? row.reason.slice(7) : null;
}

// When the router was off. A flip of the dashboard switch logs 1 "switch" line,
// which gives exact edges. Before that existed the only trace is the
// "forced:<tier>" line the hook writes per prompt, so a run of those becomes a
// window from its first prompt to the next prompt Jev actually answered.
export function forcedWindows(sorted: JevRow[], runs: SubagentRun[] = [], now: number = Date.now()): JevWindow[] {
    const out: JevWindow[] = [];
    // Held in an object so the helpers below can reassign it without TS
    // narrowing the let to null at every read site.
    const st: { open: JevWindow | null } = { open: null };
    const close = (ts: string) => { if (st.open) { st.open.to = ts; st.open = null; } };
    const start = (ts: string, tier: string, inferred: boolean) => {
        st.open = { from: ts, to: null, tier, prompts: 0, inferred, subagents: {} };
        out.push(st.open);
        return st.open;
    };
    for (const row of sorted) {
        if (row.source === "switch") {
            if (st.open && st.open.tier !== row.to) close(row.ts);
            if (typeof row.to === "string" && (JEV_TIERS as readonly string[]).includes(row.to) && !st.open) start(row.ts, row.to, false);
            continue;
        }
        const tier = forcedTier(row);
        if (tier) {
            if (st.open && st.open.tier !== tier) close(row.ts);
            (st.open ?? start(row.ts, tier, true)).prompts++;
        } else if (st.open?.inferred && statusOf(row) !== "skipped") {
            close(row.ts); // Jev answered, so the switch was back on before this prompt
        }
    }
    for (const w of out) {
        const from = Date.parse(w.from), to = w.to ? Date.parse(w.to) : now;
        for (const r of runs) {
            const t = Date.parse(r.ts);
            if (t >= from && t < to) w.subagents[r.tier] = (w.subagents[r.tier] ?? 0) + 1;
        }
    }
    return out.reverse();
}

const DECISION_LIMIT = 200;

export function aggregateJev(rows: JevRow[], now: number = Date.now(), runs: SubagentRun[] = []): JevAggregate {
    const sortedRows = [...rows].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    // Subagent launch checks are not prompts; they get their own block below.
    const all = sortedRows.filter(r => r.source !== "agent" && r.source !== "effort");
    const checked = sortedRows.filter(r => r.source === "agent" && r.verdict);
    const agentCounts = { agree: 0, under: 0, over: 0 };
    for (const r of checked) if (r.verdict && r.verdict !== "unknown") agentCounts[r.verdict]++;
    const agentChecks = {
        counts: agentCounts,
        recent: checked.slice(-DECISION_LIMIT).reverse().map(r => ({
            ts: r.ts, project: r.project, agent: r.subagent_type ?? "", task: r.prompt ?? "",
            requested: JEV_TIERS.find(t => (r.requested ?? "").toLowerCase().includes(t)) ?? r.requested ?? "", floor: r.floor ?? "", verdict: r.verdict ?? "unknown",
        })),
    };
    const windows = forcedWindows(all, runs, now);
    // Switch flips are not prompts, so every count below leaves them out.
    const sorted = all.filter(r => r.source !== "switch");

    let routed = 0, skipped = 0, errors = 0, inputTokens = 0, outputTokens = 0;
    const latencies: number[] = [];
    const tiers: Record<JevTier, number> = { haiku: 0, sonnet: 0, opus: 0, fable: 0 };
    const tiersTotal: Record<JevTier, number> = { haiku: 0, sonnet: 0, opus: 0, fable: 0 };
    const dayMap = new Map<string, { routed: number; skipped: number; errors: number; lat: number[]; tokens: number }>();
    const hourMap = new Map<string, { routed: number; skipped: number; errors: number; lat: number[]; tokens: number }>();
    const sessionMap = new Map<string, JevSession & { tierCounts: Map<string, number>; confs: number[] }>();
    let lastRoutedTs: string | null = null;

    for (const row of sorted) {
        const status = statusOf(row);
        if (status === "routed") { routed++; lastRoutedTs = row.ts; }
        else if (status === "error") errors++;
        else skipped++;

        const lat = latencyOf(row);
        if (lat !== null) latencies.push(lat);

        const tokensIn = row.input_tokens ?? 0;
        const tokensOut = row.output_tokens ?? 0;
        inputTokens += tokensIn;
        outputTokens += tokensOut;

        if (status === "routed" && row.tier && (JEV_TIERS as readonly string[]).includes(row.tier)) {
            tiers[row.tier as JevTier]++;
            tiersTotal[row.tier as JevTier]++;
        }
        const forced = forcedTier(row);
        if (forced && (JEV_TIERS as readonly string[]).includes(forced)) tiersTotal[forced as JevTier]++;

        // ── per day ──
        const day = dayOf(row.ts);
        let d = dayMap.get(day);
        if (!d) { d = { routed: 0, skipped: 0, errors: 0, lat: [], tokens: 0 }; dayMap.set(day, d); }
        if (status === "routed") d.routed++; else if (status === "error") d.errors++; else d.skipped++;
        if (lat !== null) d.lat.push(lat);
        d.tokens += tokensIn + tokensOut;

        // ── per hour ──
        const hour = hourOf(row.ts);
        let h = hourMap.get(hour);
        if (!h) { h = { routed: 0, skipped: 0, errors: 0, lat: [], tokens: 0 }; hourMap.set(hour, h); }
        if (status === "routed") h.routed++; else if (status === "error") h.errors++; else h.skipped++;
        if (lat !== null) h.lat.push(lat);
        h.tokens += tokensIn + tokensOut;

        // ── per session ──
        const sid = row.session_id || "unknown";
        let s = sessionMap.get(sid);
        if (!s) {
            s = {
                session_id: sid, project: row.project || "unknown",
                messages: 0, routed: 0, skipped: 0, errors: 0,
                topTier: null, firstTs: row.ts, lastTs: row.ts, avgConf: null,
                tierCounts: new Map(), confs: [],
            };
            sessionMap.set(sid, s);
        }
        s.messages++;
        if (status === "routed") s.routed++; else if (status === "error") s.errors++; else s.skipped++;
        if (row.project) s.project = row.project;
        s.lastTs = row.ts;
        if (status === "routed" && row.tier) s.tierCounts.set(row.tier, (s.tierCounts.get(row.tier) ?? 0) + 1);
        if (typeof row.conf === "number" && Number.isFinite(row.conf)) s.confs.push(row.conf);
    }

    const latSorted = [...latencies].sort((a, b) => a - b);
    const calls = sorted.length;

    const totals: JevTotals = {
        calls,
        routed,
        skipped,
        errors,
        routedPct: calls > 0 ? Math.round((routed / calls) * 1000) / 10 : 0,
        avgLatencyMs: mean(latencies),
        p95LatencyMs: percentile(latSorted, 95),
        inputTokens,
        outputTokens,
        // Only lines that reached the API cost anything - a skipped prompt (slash,
        // short, notification, forced tier) never leaves the hook.
        estCostUsd: (routed + errors) * JEV_COST_PER_CALL,
        sessions: sessionMap.size,
        lastCallTs: calls > 0 ? sorted[calls - 1].ts : null,
        lastRoutedTs,
    };

    // "never" until the router actually answers once. After that the only
    // question is how recently - anything past the 15 min live window reads as
    // stale, whether it is an hour old or a month.
    let health: JevHealth = "never";
    if (lastRoutedTs) {
        health = now - Date.parse(lastRoutedTs) < LIVE_MS ? "live" : "stale";
    }
    // An open forced window means the switch is off right now, whatever the
    // last routed row says. The card then reads "off", not "stale".
    if (windows[0]?.to === null) health = "off";

    const daily: JevDay[] = [...dayMap.entries()]
        .map(([day, d]) => ({
            day,
            routed: d.routed,
            skipped: d.skipped,
            errors: d.errors,
            avgLatencyMs: mean(d.lat),
            p95LatencyMs: percentile([...d.lat].sort((a, b) => a - b), 95),
            tokens: d.tokens,
            costUsd: (d.routed + d.errors) * JEV_COST_PER_CALL,
        }))
        .sort((a, b) => a.day.localeCompare(b.day));

    // Always exactly 24 buckets ending at the current hour, zero-filled. A gap
    // in the day is information - "nothing happened at 4am" is the shape the
    // chart is there to show - so quiet hours stay in rather than collapsing.
    const hourly: JevHour[] = [];
    for (let i = HOURLY_WINDOW - 1; i >= 0; i--) {
        const hour = localHourKey(now - i * HOUR_MS);
        const h = hourMap.get(hour);
        hourly.push({
            hour,
            label: `${hour.slice(11)}:00`,
            routed: h?.routed ?? 0,
            skipped: h?.skipped ?? 0,
            errors: h?.errors ?? 0,
            avgLatencyMs: mean(h?.lat ?? []),
            tokens: h?.tokens ?? 0,
            costUsd: ((h?.routed ?? 0) + (h?.errors ?? 0)) * JEV_COST_PER_CALL,
        });
    }

    const sessions: JevSession[] = [...sessionMap.values()]
        .map(s => {
            let topTier: string | null = null;
            let best = 0;
            for (const [tier, count] of s.tierCounts) {
                if (count > best) { best = count; topTier = tier; }
            }
            return {
                session_id: s.session_id, project: s.project, messages: s.messages,
                routed: s.routed, skipped: s.skipped, errors: s.errors,
                topTier, firstTs: s.firstTs, lastTs: s.lastTs,
                avgConf: s.confs.length > 0
                    ? Math.round((s.confs.reduce((x, y) => x + y, 0) / s.confs.length) * 100) / 100
                    : null,
            };
        })
        .sort((a, b) => Date.parse(b.lastTs) - Date.parse(a.lastTs));


    // Ground truth for a route: the subagents that started in the same session
    // after the prompt and before the next one (capped at 10 min).
    const promptTimes = new Map<string, number[]>();
    for (const r of sorted) if (r.session_id) {
        const list = promptTimes.get(r.session_id) ?? [];
        list.push(Date.parse(r.ts));
        promptTimes.set(r.session_id, list);
    }
    const rank = (t: string) => (JEV_TIERS as readonly string[]).indexOf(t);
    const outcomeOf = (r: JevRow): JevOutcome | null => {
        if (!runs.length || !r.session_id) return null;
        const from = Date.parse(r.ts);
        const next = (promptTimes.get(r.session_id) ?? []).find(t => t > from) ?? Infinity;
        const until = Math.min(next, from + 10 * 60_000);
        const ran = runs.filter(x => x.session === r.session_id && rank(x.tier) >= 0)
            .map(x => ({ at: Date.parse(x.ts), tier: x.tier })).filter(x => x.at >= from && x.at < until);
        if (!ran.length) return "main";
        const want = rank(r.applied ?? r.tier ?? "");
        if (ran.some(x => rank(x.tier) === want)) return "followed";
        return Math.max(...ran.map(x => rank(x.tier))) > want ? "over" : "under";
    };
    const outcomes: Record<JevOutcome, number> = { followed: 0, over: 0, under: 0, main: 0 };
    const decisions: JevDecision[] = sorted.filter(r => statusOf(r) === "routed").slice(-DECISION_LIMIT).reverse()
        .map(r => {
            const outcome = outcomeOf(r);
            if (outcome) outcomes[outcome]++;
            return {
                ts: r.ts, session_id: r.session_id, project: r.project, prompt: r.prompt ?? "",
                tier: r.tier ?? "", conf: r.conf ?? 0, agent: r.agent ?? "none", agentConf: r.agent_conf ?? 0, outcome,
            };
        });

    return { totals, health, daily, hourly, tiers, tiersTotal, sessions, windows, decisions, outcomes, agentChecks };
}
