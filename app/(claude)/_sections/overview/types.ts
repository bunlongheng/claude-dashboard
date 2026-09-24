// Shared types for the Overview section's data + extracted subcomponents.

export interface Stats {
    sessions: number;
    activeSessions: number;
    skills: number;
    commands: number;
    hooks: number;
    mcp: number;
    mcpMine: number;
    mcpShipped: number;
    plugins: number;
    claudeMd: number;
    memory: number;
    settings: number;
    rules: number;
    tokens: { input: number; output: number; cacheRead: number; cost: number };
}

export interface RagStats {
    documents: number;
    chunks: number;
    preferences: number;
}

export interface DayBucket {
    day: string;
    turns: number;
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
    sessions: number;
}

// Return shape of the Overview's `heatmapData` useMemo - only the fields the
// extracted activity-heatmap card actually reads from it.
export interface HeatmapData {
    cellMap: Map<string, { date: string; turns: number; weekIndex: number; dayOfWeek: number }>;
    weeksCount: number;
    months: { label: string; weekIndex: number }[];
    maxTurns: number;
    longestStreak: number;
    currentStreak: number;
    dayMap: Map<string, number>;
}
