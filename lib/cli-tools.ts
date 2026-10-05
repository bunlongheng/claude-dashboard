// The built-in / harness tools Claude Code exposes, with a 1-line description.
// Plain data so both the CLI page and the cli-log route can read it.
export const CLI_DESCRIPTIONS: Record<string, string> = {
    Bash: "Run shell commands",
    Edit: "Edit a file in place",
    MultiEdit: "Multiple edits to one file",
    Read: "Read a file",
    Write: "Create or overwrite a file",
    Glob: "Find files by pattern",
    Grep: "Search file contents",
    WebFetch: "Fetch and read a URL",
    WebSearch: "Search the web",
    TaskCreate: "Create a task",
    TaskUpdate: "Update a task",
    TaskList: "List tasks",
    TaskGet: "Get a task",
    TaskOutput: "Read task output",
    TaskStop: "Stop a task",
    TodoWrite: "Manage the todo list",
    Agent: "Launch a sub-agent",
    Skill: "Invoke a skill",
    AskUserQuestion: "Ask the user a question",
    ToolSearch: "Find deferred tools",
    ExitPlanMode: "Submit a plan for approval",
    EnterPlanMode: "Enter planning mode",
    ScheduleWakeup: "Schedule a wake-up",
    CronCreate: "Create a scheduled job",
    CronDelete: "Delete a scheduled job",
    CronList: "List scheduled jobs",
    NotebookEdit: "Edit a Jupyter notebook",
    PushNotification: "Send a push notification",
    SendUserFile: "Send a file to the user's device",
    SendMessage: "Message another agent or session",
    ListAgents: "List agents and sessions reachable from here",
    Monitor: "Watch a command and wake on new output",
    Workflow: "Run a multi-agent workflow script",
    SendFeedback: "Draft feedback about Claude Code",
    Artifact: "Publish a page as an artifact",
    ReportFindings: "Report code review findings",
};

export const CLI_TOOLS = Object.keys(CLI_DESCRIPTIONS);

// What a tool's targets are called in the drill-in: Bash runs commands,
// Agent launches agent types, Read opens file types.
export function cliTargetNoun(tool: string): string {
    switch (tool) {
        case "Bash": return "commands";
        case "Agent": return "agent types";
        case "Skill": return "skills";
        case "Read": case "Edit": case "MultiEdit": case "Write": case "NotebookEdit": return "file types";
        case "Glob": case "Grep": return "patterns";
        case "WebFetch": return "hosts";
        case "WebSearch": case "ToolSearch": return "queries";
        default: return "targets";
    }
}
