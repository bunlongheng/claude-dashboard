// Sub-cent aware USD formatter. The Jev router costs fractions of a cent per
// call, so 2 decimals reads as $0.00 until the log is enormous. Widen the
// precision instead of lying about it.
export function formatUsd(usd: number): string {
    if (usd === 0) return "$0";
    if (usd < 0.01) return `$${usd.toFixed(5).replace(/0+$/, "").replace(/\.$/, "")}`;
    return `$${usd.toFixed(2)}`;
}
