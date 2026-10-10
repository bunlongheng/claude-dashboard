// Sub-cent aware USD formatter. The Jev router costs fractions of a cent per
// call, so 2 decimals reads as $0.00 until the log is enormous. Widen the
// precision instead of lying about it.
export function formatUsd(usd: number): string {
    if (usd === 0) return "$0";
    if (usd < 0.01) return `$${usd.toFixed(5).replace(/0+$/, "").replace(/\.$/, "")}`;
    return `$${usd.toFixed(2)}`;
}

// Local-time YYYY-MM-DD (not toISOString which is UTC). Keeps day buckets, the
// activity grid, and the punchcard in the same wall-clock frame.
export function localYMD(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
