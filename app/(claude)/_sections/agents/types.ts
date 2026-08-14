export interface AgentInfo {
    id: string;
    sessionId: string;
    project: string;
    subagentType: string;
    description: string;
    prompt: string;
    status: "running" | "done" | "failed";
    result: string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
}

// Live agent events from WebSocket
export interface LiveEvent {
    type: "agent_start" | "agent_complete";
    toolUseId: string;
    sessionId: string;
    description: string;
    subagentType: string;
    prompt?: string;
    status?: string;
    result?: string;
    durationMs?: number;
    timestamp: string;
}

export interface AgentChar {
    id: number;
    name: string;
    role: string;
    color: string;
    img: string;
}
