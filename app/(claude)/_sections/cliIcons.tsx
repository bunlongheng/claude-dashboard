import type React from "react";
import {
    Terminal, Pencil, FileText, FilePlus, FolderTree, Search, Globe,
    Bot, Sparkles, MessageCircle, FileSearch, FileCode,
    ListChecks as ListChecksIcon, ListTodo, Clock as ClockIcon, Bell as BellIcon,
    Send, MessageSquare, Users, Eye, Workflow, ThumbsUp, Share2, ClipboardList,
} from "lucide-react";

// Icon map for Claude Code's built-in CLI tools. Shared by the CLI, Agents,
// Overview, and sidebar sections.
export const CLI_ICON_MAP: Record<string, React.ElementType> = {
    Bash: Terminal,
    Edit: Pencil,
    MultiEdit: Pencil,
    Read: FileText,
    Write: FilePlus,
    Glob: FolderTree,
    Grep: Search,
    WebFetch: Globe,
    WebSearch: Globe,
    TaskCreate: ListChecksIcon,
    TaskUpdate: ListChecksIcon,
    TaskList: ListChecksIcon,
    TaskGet: ListChecksIcon,
    TaskOutput: ListChecksIcon,
    TaskStop: ListChecksIcon,
    TodoWrite: ListTodo,
    Agent: Bot,
    Skill: Sparkles,
    AskUserQuestion: MessageCircle,
    ToolSearch: FileSearch,
    ExitPlanMode: ListTodo,
    EnterPlanMode: ListTodo,
    ScheduleWakeup: ClockIcon,
    CronCreate: ClockIcon,
    CronDelete: ClockIcon,
    CronList: ClockIcon,
    NotebookEdit: FileCode,
    PushNotification: BellIcon,
    SendUserFile: Send,
    SendMessage: MessageSquare,
    ListAgents: Users,
    Monitor: Eye,
    Workflow: Workflow,
    SendFeedback: ThumbsUp,
    Artifact: Share2,
    ReportFindings: ClipboardList,
};

export function cliIconFor(name: string): React.ElementType {
    return CLI_ICON_MAP[name] || Terminal;
}
