"use client";

import { useState } from "react";
import { cliIconFor, CLI_ICON_MAP } from "./cliIcons";
import { FileViews, ViewModeToggle, type ViewMode } from "./FileViews";

const ACCENT = "#34C759";

// Short descriptions for the built-in / harness CLI tools Claude Code exposes.
const CLI_DESCRIPTIONS: Record<string, string> = {
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
};

export default function CliSection() {
    const tools = Object.keys(CLI_ICON_MAP);
    const [mode, setMode] = useState<ViewMode>("list");

    const items = tools.map(name => ({
        id: name,
        name,
        description: CLI_DESCRIPTIONS[name] ?? "",
        content: CLI_DESCRIPTIONS[name] ?? "(no description)",
    }));

    return (
        <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {tools.length} built-in tools
                </div>
                <ViewModeToggle mode={mode} onMode={setMode} />
            </div>
            <FileViews mode={mode} accent={ACCENT} items={items} getIcon={(i) => cliIconFor(i.id)} />
        </div>
    );
}
