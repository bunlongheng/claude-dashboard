export interface TodoItem {
    id: string;
    subject: string;
    status: string;
    description?: string;
    activeForm?: string;
}

export interface UsageState {
    input_tokens: number;
    output_tokens: number;
    cache_read: number;
    cache_creation: number;
    model: string;
}

export interface ActivityItem {
    id: string;
    type: "thinking" | "tool" | "tool_result" | "text" | "user_msg" | "usage";
    content: string;
    toolName?: string;
    timestamp: string;
}

export interface SessionMeta {
    sessionId: string;
    projectName: string;
    cwd: string;
    gitBranch: string;
    version: string;
    createdAt: string;
    lastModified: string;
    active: boolean;
    firstMessage: string;
    customTitle: string | null;
    todos: TodoItem[];
    lastUsage: UsageState | null;
    messageCount: number;
}
