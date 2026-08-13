"use client";

import { useMemo, useState } from "react";
import { CurrencyDollarIcon, TableCellsIcon, ClipboardDocumentIcon, CheckIcon } from "@heroicons/react/24/outline";
import { StatCard, SectionHeader, fmtNum, hexToRgba } from "./shared";

interface UsageRow {
    model: string;
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    uncached_input: number;
    cache_read: number;
    cache_write_5m: number;
    cache_write_1h: number;
    web_search: number;
    net_usd: number;
    gross_usd: number;
}

const MODEL_COLOR: Record<string, string> = {
    opus: "#ff6347", sonnet: "#4A9EFF", haiku: "#3FB68B",
};
function tier(model: string): keyof typeof MODEL_COLOR {
    const m = (model || "").toLowerCase();
    if (m.includes("opus")) return "opus";
    if (m.includes("haiku")) return "haiku";
    return "sonnet";
}
function usd(n: number) { return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

type NumCol = Exclude<keyof UsageRow, "model">;
const COLS: { key: NumCol; label: string; money?: boolean }[] = [
    { key: "requests", label: "requests" },
    { key: "prompt_tokens", label: "prompt_tok" },
    { key: "completion_tokens", label: "completion" },
    { key: "uncached_input", label: "uncached_in" },
    { key: "cache_read", label: "cache_read" },
    { key: "cache_write_5m", label: "cw_5m" },
    { key: "cache_write_1h", label: "cw_1h" },
    { key: "web_search", label: "web" },
    { key: "net_usd", label: "net_usd", money: true },
    { key: "gross_usd", label: "gross_usd", money: true },
];

export default function UsageSection({ initialRows }: { initialRows: UsageRow[] }) {
    const [copied, setCopied] = useState(false);
    const rows = initialRows;

    const totals = useMemo(() => rows.reduce((t, r) => ({
        requests: t.requests + r.requests,
        prompt_tokens: t.prompt_tokens + r.prompt_tokens,
        completion_tokens: t.completion_tokens + r.completion_tokens,
        uncached_input: t.uncached_input + r.uncached_input,
        cache_read: t.cache_read + r.cache_read,
        cache_write_5m: t.cache_write_5m + r.cache_write_5m,
        cache_write_1h: t.cache_write_1h + r.cache_write_1h,
        web_search: t.web_search + r.web_search,
        net_usd: t.net_usd + r.net_usd,
        gross_usd: t.gross_usd + r.gross_usd,
    }), { requests: 0, prompt_tokens: 0, completion_tokens: 0, uncached_input: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, web_search: 0, net_usd: 0, gross_usd: 0 }), [rows]);

    const saved = totals.gross_usd - totals.net_usd;
    const savedPct = totals.gross_usd > 0 ? (saved / totals.gross_usd) * 100 : 0;

    const copyTsv = () => {
        const header = ["model", ...COLS.map(c => c.label)].join("\t");
        const body = rows.map(r => [r.model, ...COLS.map(c => c.money ? (r[c.key] as number).toFixed(2) : r[c.key])].join("\t")).join("\n");
        navigator.clipboard.writeText(`${header}\n${body}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const fmtCell = (r: UsageRow, c: typeof COLS[number]) =>
        c.money ? usd(r[c.key] as number) : fmtNum(r[c.key] as number);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <StatCard label="Net spend" value={usd(totals.net_usd)} sub="actual, with caching" color="#ff6347" />
                <StatCard label="Gross spend" value={usd(totals.gross_usd)} sub="if nothing were cached" color="#4A9EFF" />
                <StatCard label="Saved by cache" value={usd(saved)} sub={`${savedPct.toFixed(1)}% off`} color="#3FB68B" />
                <StatCard label="Requests" value={fmtNum(totals.requests)} sub={`${rows.length} models`} color="#7C5CFF" />
            </div>

            <div>
                <div className="flex items-center justify-between mb-2">
                    <SectionHeader icon={TableCellsIcon} title="Per-model breakdown" />
                    <button
                        type="button"
                        onClick={copyTsv}
                        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/40 hover:text-white/70 transition-colors border border-white/[0.08] rounded-md px-2 py-1"
                    >
                        {copied ? <CheckIcon className="w-3 h-3" /> : <ClipboardDocumentIcon className="w-3 h-3" />}
                        {copied ? "Copied" : "Copy TSV"}
                    </button>
                </div>

                <div className="bg-[#0f1117] border border-white/[0.08] rounded-xl overflow-x-auto">
                    <table className="w-full text-xs whitespace-nowrap">
                        <thead>
                            <tr className="text-white/35 border-b border-white/[0.08]">
                                <th className="text-left font-semibold uppercase tracking-wide text-[10px] px-3 py-2 sticky left-0 bg-[#0f1117]">model</th>
                                {COLS.map(c => (
                                    <th key={c.key} className="text-right font-semibold uppercase tracking-wide text-[10px] px-3 py-2">{c.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => {
                                const color = MODEL_COLOR[tier(r.model)];
                                return (
                                    <tr key={r.model} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                                        <td className="px-3 py-2 sticky left-0 bg-[#0f1117]">
                                            <span className="inline-flex items-center gap-2 font-medium" style={{ color }}>
                                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                                                {r.model}
                                            </span>
                                        </td>
                                        {COLS.map(c => (
                                            <td key={c.key} className="text-right px-3 py-2 tabular-nums"
                                                style={c.money ? { color, fontWeight: 600 } : { color: "rgba(255,255,255,0.7)" }}>
                                                {fmtCell(r, c)}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t border-white/[0.12] font-bold" style={{ background: hexToRgba("#ffffff", 0.02) }}>
                                <td className="px-3 py-2 sticky left-0 bg-[#0f1117] uppercase text-[10px] tracking-wide text-white/60">Total</td>
                                {COLS.map(c => (
                                    <td key={c.key} className="text-right px-3 py-2 tabular-nums text-white"
                                        style={c.money ? { color: c.key === "net_usd" ? "#ff6347" : "#4A9EFF" } : undefined}>
                                        {c.money ? usd(totals[c.key] as number) : fmtNum(totals[c.key] as number)}
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <p className="text-[11px] text-white/25 mt-2 flex items-center gap-1.5">
                    <CurrencyDollarIcon className="w-3 h-3" />
                    Live from local <code className="text-white/35">~/.claude/projects</code> logs - all sessions on this machine. prompt_tok = uncached + cache_read + cw_5m + cw_1h. USD via Anthropic per-model pricing.
                </p>
            </div>
        </div>
    );
}
