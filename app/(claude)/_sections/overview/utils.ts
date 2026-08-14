// Local-time YYYY-MM-DD - keeps day keys aligned with /api/claude/token-stats/daily
// (which buckets by local date too) so the grid doesn't show future hours.
export function localYMD(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
