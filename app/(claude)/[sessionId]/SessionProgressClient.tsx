"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { marked } from "marked";
import VoiceModal from "../_sections/VoiceModal";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-python";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-diff";
import {
    Activity, Zap,
    CheckCircle2, Circle, AlertCircle, Loader2,
    Terminal, FileText, Search, Edit3, Bot, Eye,
    MessageSquare, Brain,
} from "lucide-react";
import { useToast } from "../_sections/ToastContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TodoItem {
    id: string;
    subject: string;
    status: string;
    description?: string;
    activeForm?: string;
}

interface UsageState {
    input_tokens: number;
    output_tokens: number;
    cache_read: number;
    cache_creation: number;
    model: string;
}

interface ActivityItem {
    id: string;
    type: "thinking" | "tool" | "tool_result" | "text" | "user_msg" | "usage";
    content: string;
    toolName?: string;
    timestamp: string;
}

interface SessionMeta {
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

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTEXT_LIMIT = 200_000;

const TOOL_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    Bash:      { icon: Terminal,    color: "#22d3ee", label: "Bash"      },
    Read:      { icon: FileText,    color: "#60a5fa", label: "Read"      },
    Edit:      { icon: Edit3,       color: "#f97316", label: "Edit"      },
    Write:     { icon: Edit3,       color: "#c084fc", label: "Write"     },
    Grep:      { icon: Search,      color: "#f472b6", label: "Grep"      },
    Glob:      { icon: Search,      color: "#fb923c", label: "Glob"      },
    Agent:     { icon: Bot,         color: "#4ade80", label: "Agent"     },
    WebFetch:  { icon: Eye,         color: "#facc15", label: "WebFetch"  },
    WebSearch: { icon: Eye,         color: "#facc15", label: "Search"    },
    default:   { icon: Zap,         color: "#94a3b8", label: "Tool"      },
};

const STATUS_CFG = {
    pending:     { label: "Pending",     color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)",  Icon: Circle       },
    in_progress: { label: "In Progress", color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.2)",   Icon: Loader2      },
    completed:   { label: "Done",        color: "#4ade80", bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.2)",   Icon: CheckCircle2 },
    blocked:     { label: "Blocked",     color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.2)",  Icon: AlertCircle  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60)  return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function fmtTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

function shortTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

// ─── Token Bar ────────────────────────────────────────────────────────────────

function TokenBar({ usage }: { usage: UsageState | null }) {
    if (!usage) return null;

    const { input_tokens, output_tokens, cache_read, cache_creation } = usage;
    const totalUsed = input_tokens + output_tokens + cache_read + cache_creation;
    const pct = Math.min((totalUsed / CONTEXT_LIMIT) * 100, 100);
    const ctxColor = pct > 80 ? "#f87171" : pct > 50 ? "#facc15" : "#60a5fa";

    const pills = [
        { label: "ctx", value: `${fmtTokens(totalUsed)} / ${fmtTokens(CONTEXT_LIMIT)}`, color: ctxColor },
        { label: "in",  value: fmtTokens(input_tokens),   color: "#60a5fa" },
        { label: "out", value: fmtTokens(output_tokens),  color: "#4ade80" },
        { label: "↩︎",  value: fmtTokens(cache_read),     color: "#f97316" },
        ...(usage.model ? [{ label: "model", value: usage.model.replace("claude-", "").replace(/-(\d)/, " $1"), color: "#94a3b8" }] : []),
    ];

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {pills.map(p => (
                <span key={p.label} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono"
                    style={{ background: `${p.color}12`, border: `1px solid ${p.color}30`, color: p.color }}>
                    <span className="text-[9px] opacity-50">{p.label}</span> {p.value}
                </span>
            ))}
        </div>
    );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanCol({ status, todos }: { status: keyof typeof STATUS_CFG; todos: TodoItem[] }) {
    const cfg = STATUS_CFG[status];
    const { Icon } = cfg;
    if (todos.length === 0) return null;

    return (
        <div
            className="rounded-xl p-3 flex flex-col gap-2 min-w-0"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
        >
            <div className="flex items-center gap-2 mb-1">
                <Icon size={11} style={{ color: cfg.color }} className={status === "in_progress" ? "animate-spin" : ""} />
                <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: cfg.color }}>{cfg.label}</span>
                <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: `${cfg.color}20`, color: cfg.color }}>{todos.length}</span>
            </div>
            {todos.map(t => (
                <div
                    key={t.id}
                    className="rounded-lg px-2.5 py-2 text-[11px] text-white/70 leading-snug"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                    <p className="font-medium text-white/85">{t.subject}</p>
                    {t.description && <p className="text-[10px] text-white/35 mt-1 line-clamp-2">{t.description}</p>}
                    {t.activeForm && status === "in_progress" && (
                        <p className="text-[9px] mt-1 font-medium" style={{ color: cfg.color }}>↳ {t.activeForm}</p>
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── Activity Item ────────────────────────────────────────────────────────────

function copyText(text: string) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
    } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    }
}

function CopyBtn({ text, showToast }: { text: string; showToast: (msg: string, color?: string) => void }) {
    return (
        <button
            onClick={() => { copyText(text); showToast("Copied"); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-white/10 cursor-pointer"
            title="Copy"
        >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
        </button>
    );
}

// Detect language from content for syntax highlighting
function detectLang(content: string): string {
    if (content.includes("import ") && (content.includes("from ") || content.includes("require("))) return "typescript";
    if (content.includes("function ") || content.includes("const ") || content.includes("=>")) return "typescript";
    if (content.includes("<div") || content.includes("<span") || content.includes("className=")) return "tsx";
    if (content.includes("def ") || content.includes("import ") && content.includes(":")) return "python";
    if (/^\s*\{/.test(content) && /\}\s*$/.test(content)) return "json";
    if (content.includes("$ ") || content.includes("#!/") || content.includes("&&")) return "bash";
    if (content.startsWith("diff ") || content.includes("\n+") || content.includes("\n-")) return "diff";
    return "bash";
}

function highlightCode(code: string, lang?: string): string {
    const language = lang || detectLang(code);
    const grammar = Prism.languages[language];
    if (!grammar) return code.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return Prism.highlight(code, grammar, language);
}

// Configure marked to use Prism for code blocks
const renderer = new marked.Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
    const html = highlightCode(text, lang || undefined);
    return `<pre style="background:rgba(0,0,0,0.3);padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);overflow-x:auto"><code class="language-${lang || "text"}">${html}</code></pre>`;
};
marked.setOptions({ renderer });

function ActivityRow({ item, isLatest, showToast }: { item: ActivityItem; isLatest: boolean; showToast: (msg: string, color?: string) => void }) {
    const parsedHtml = useMemo(
        () => item.type === "text" ? marked.parse(item.content, { gfm: true }) as string : "",
        [item.type, item.content],
    );

    if (item.type === "usage") return null;

    const isUser = item.type === "user_msg";

    const toolMeta = item.toolName ? (TOOL_META[item.toolName] ?? TOOL_META.default) : null;
    const ToolIcon = toolMeta?.icon ?? Zap;

    const typeConfig = {
        thinking:    { color: "#f97316", label: "Thinking",  Icon: Brain         },
        tool:        { color: toolMeta?.color ?? "#94a3b8", label: toolMeta?.label ?? "Tool", Icon: ToolIcon },
        tool_result: { color: "#22d3ee", label: "Output",    Icon: Terminal      },
        text:        { color: "#60a5fa", label: "Response",  Icon: MessageSquare },
        user_msg:    { color: "#4ade80", label: "User",      Icon: MessageSquare },
    }[item.type] ?? { color: "#94a3b8", label: "Event", Icon: Zap };

    if (isUser) {
        return (
            <div className="flex justify-end group">
                <div className="flex items-start gap-1">
                    <CopyBtn text={item.content} showToast={showToast} />
                    <div
                        className="px-3 py-2.5 rounded-2xl rounded-tr-sm cursor-pointer"
                        style={{ background: "#0b84fe" }}
                        onDoubleClick={() => { copyText(item.content); showToast("Copied"); }}
                    >
                        <p className="text-[11px] text-white font-medium leading-relaxed break-words">
                            {item.content}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="w-full px-3 py-2.5 rounded-lg group cursor-pointer"
            style={{ background: "#1c1c1e" }}
            onDoubleClick={() => { copyText(item.content); showToast("Copied"); }}
        >
            <div className="flex items-center gap-2 mb-1">
                <typeConfig.Icon size={10} style={{ color: typeConfig.color }} />
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: typeConfig.color }}>
                    {typeConfig.label}
                </span>
                {isLatest && (
                    <span className="flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                    </span>
                )}
                <span className="ml-auto text-[9px] font-mono text-white/20 shrink-0">{shortTime(item.timestamp)}</span>
                <CopyBtn text={item.content} showToast={showToast} />
            </div>
            {item.type === "text" ? (
                <div
                    className="text-[11px] text-white/75 leading-relaxed prose-invert prose-sm max-w-none markdown-content"
                    dangerouslySetInnerHTML={{ __html: parsedHtml }}
                />
            ) : item.type === "tool_result" ? (() => {
                // Detect real diffs: must have diff header, @@ hunks, or file updated messages
                const lines = item.content.split("\n");
                const isDiff = item.content.startsWith("diff ") ||
                    lines.some(l => l.startsWith("@@")) ||
                    (item.content.includes("has been updated") && lines.some(l => /^\d+\s*[-+]/.test(l)));
                if (isDiff) {
                    return (
                        <div className="text-[10px] leading-[1.7] font-mono overflow-auto max-h-[400px]"
                            style={{ background: "#1e1e1e", borderRadius: 6, marginTop: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
                            {lines.map((line, i) => {
                                let cls = "";
                                let color = "#f8f8f2";
                                if (line.startsWith("+") && !line.startsWith("+++")) { cls = "diff-add"; color = "#a6e22e"; }
                                else if (line.startsWith("-") && !line.startsWith("---")) { cls = "diff-del"; color = "#f92672"; }
                                else if (line.startsWith("@@")) { cls = "diff-hunk"; color = "#ae81ff"; }
                                else if (line.startsWith("diff ") || line.startsWith("---") || line.startsWith("+++")) { cls = "diff-header"; color = "#fd971f"; }
                                else { color = "#75715e"; }
                                return <div key={i} className={cls} style={{ color, padding: "0 10px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{line || " "}</div>;
                            })}
                        </div>
                    );
                }
                const lang = detectLang(item.content);
                const html = highlightCode(item.content, lang);
                return (
                    <pre className="text-[10px] leading-[1.7] font-mono overflow-auto max-h-[400px]"
                        style={{ background: "#1e1e1e", padding: "8px 10px", borderRadius: 6, marginTop: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
                        <code dangerouslySetInnerHTML={{ __html: html }} />
                    </pre>
                );
            })(
            ) : (
                <p className="text-[11px] text-white/65 leading-relaxed font-mono break-all">
                    {item.content}
                </p>
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SessionProgressClient({ meta }: { meta: SessionMeta }) {
    const { showToast } = useToast();
    const [todos, setTodos] = useState<TodoItem[]>(meta.todos);
    const [usage, setUsage] = useState<UsageState | null>(meta.lastUsage);
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [lastUserMsg, setLastUserMsg] = useState<string>(meta.firstMessage || "");
    const [connected, setConnected] = useState(false);
    const [active, setActive] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(meta.lastModified);
    const [thinkingState, setThinkingState] = useState<{ text: string; startedAt: number } | null>(null);
    const [thinkingElapsed, setThinkingElapsed] = useState(0);
    const [antCount, setAntCount] = useState(0);
    const [confetti, setConfetti] = useState<{ id: number; x: number; y: number }[]>([]);
    const antRowRef = useRef<HTMLDivElement>(null);
    const antRectRef = useRef<DOMRect | null>(null);
    const prevActiveRef = useRef(false);
    const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const idxRef = useRef(0);
    const feedRef = useRef<HTMLDivElement>(null);
    const injectedMsgs = useRef<Set<string>>(new Set());

    const addActivity = useCallback((item: Omit<ActivityItem, "id">) => {
        const id = String(idxRef.current++);
        setActivity(prev => [{ ...item, id }, ...prev].slice(0, 200));
        setLastUpdate(item.timestamp);
        setActive(true);
        // Reset inactivity timer - hide ants after 5s of no events
        if (inactivityRef.current) clearTimeout(inactivityRef.current);
        inactivityRef.current = setTimeout(() => setActive(false), 5000);
        if (item.type === "user_msg" && item.content) setLastUserMsg(item.content);
        if (item.type === "thinking") {
            setThinkingState({ text: item.content, startedAt: Date.now() });
            setThinkingElapsed(0);
        } else if (item.type === "user_msg") {
            // User sent a new message - clear thinking immediately
            setThinkingState(null);
        }
    }, []);

    const [pageUrl, setPageUrl] = useState("");
    const [showQr, setShowQr] = useState(false);
    const [showVoice, setShowVoice] = useState(false);
    useEffect(() => {
        fetch("/api/claude/lan")
            .then(r => r.json())
            .then(d => setPageUrl(`http://${d.ip}:${d.port}/${meta.sessionId}`))
            .catch(() => {
                const base = `${window.location.protocol}//${window.location.host}`;
                setPageUrl(`${base}/${meta.sessionId}`);
            });
    }, [meta.sessionId]);

    const [inputText, setInputText] = useState("");
    const [sending, setSending] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Ant counter - 1 per second while active
    // Track ant row position while visible
    useEffect(() => {
        if (active && antRowRef.current) {
            antRectRef.current = antRowRef.current.getBoundingClientRect();
        }
    });

    // Spawn confetti when ants die
    useEffect(() => {
        if (prevActiveRef.current && !active && antRectRef.current) {
            const rect = antRectRef.current;
            const particles = Array.from({ length: 24 }, (_, i) => ({
                id: Date.now() + i,
                x: rect.left + Math.random() * rect.width,
                y: rect.top + rect.height / 2,
            }));
            setConfetti(particles);
            setTimeout(() => setConfetti([]), 1200);
        }
        prevActiveRef.current = active;
    }, [active]);

    useEffect(() => {
        if (!active || !connected) { setAntCount(0); return; }
        setAntCount(1);
        const t = setInterval(() => setAntCount(c => Math.min(c + 1, 40)), 1000);
        return () => clearInterval(t);
    }, [active, connected]);

    const sendInput = useCallback(async () => {
        const text = inputText.trim();
        if (!text) return;
        // Optimistic bubble immediately + track to skip SSE echo
        injectedMsgs.current.add(text);
        addActivity({ type: "user_msg", content: text, timestamp: new Date().toISOString() });
        setInputText("");
        inputRef.current?.focus();
        // POST via Next.js proxy (avoids LAN port issues)
        try {
            const res = await fetch(`/api/claude/claude-sessions/${meta.sessionId}/input`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });
            const data = await res.json();
            if (!data.ok) {
                addActivity({ type: "text", content: "⚠️ Injection failed - is Claude Code running in this session?", timestamp: new Date().toISOString() });
            }
        } catch {
            addActivity({ type: "text", content: "⚠️ Could not send input", timestamp: new Date().toISOString() });
        }
    }, [inputText, addActivity, meta.sessionId]);

    // Tick elapsed time while thinking
    useEffect(() => {
        if (!thinkingState) return;
        const t = setInterval(() => setThinkingElapsed(Date.now() - thinkingState.startedAt), 1000);
        return () => clearInterval(t);
    }, [thinkingState]);

    // Auto-scroll to bottom on new activity
    useEffect(() => {
        const el = feedRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [activity]);

    // SSE stream - replaces WebSocket connection
    useEffect(() => {
        let destroyed = false;
        let es: EventSource | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        function connect() {
            if (destroyed) return;
            es = new EventSource(`/api/claude/claude-sessions/${meta.sessionId}/stream`);

            es.addEventListener("ready", () => { if (!destroyed) setConnected(true); });

            es.addEventListener("thinking", (e) => {
                const data = JSON.parse(e.data);
                addActivity({ type: "thinking", content: String(data.text ?? ""), timestamp: String(data.timestamp ?? "") });
            });
            es.addEventListener("tool", (e) => {
                const data = JSON.parse(e.data);
                addActivity({ type: "tool", content: String(data.summary ?? ""), toolName: String(data.name ?? ""), timestamp: String(data.timestamp ?? "") });
            });
            es.addEventListener("text", (e) => {
                const data = JSON.parse(e.data);
                addActivity({ type: "text", content: String(data.text ?? ""), timestamp: String(data.timestamp ?? "") });
            });
            es.addEventListener("user_msg", (e) => {
                const data = JSON.parse(e.data);
                const text = String(data.text ?? "");
                // Skip if this was injected from the input box (already shown optimistically)
                if (injectedMsgs.current.has(text)) {
                    injectedMsgs.current.delete(text);
                    return;
                }
                addActivity({ type: "user_msg", content: text, timestamp: String(data.timestamp ?? "") });
            });
            es.addEventListener("tool_result", (e) => {
                const data = JSON.parse(e.data);
                addActivity({ type: "tool_result", content: String(data.content ?? ""), timestamp: String(data.timestamp ?? "") });
            });
            es.addEventListener("todos", (e) => {
                const data = JSON.parse(e.data);
                setTodos(data.todos as TodoItem[]);
            });
            es.addEventListener("usage", (e) => {
                const data = JSON.parse(e.data);
                setUsage({
                    input_tokens:   Number(data.input_tokens ?? 0),
                    output_tokens:  Number(data.output_tokens ?? 0),
                    cache_read:     Number(data.cache_read ?? 0),
                    cache_creation: Number(data.cache_creation ?? 0),
                    model:          String(data.model ?? ""),
                });
            });

            es.onerror = () => {
                if (destroyed) return;
                setConnected(false);
                es?.close();
                retryTimer = setTimeout(connect, 3000);
            };
        }

        connect();

        return () => {
            destroyed = true;
            if (retryTimer) clearTimeout(retryTimer);
            es?.close();
        };
    }, [meta.sessionId, addActivity]);


    // Group todos by status
    const byStatus = (status: string) => todos.filter(t => t.status === status);
    const pending     = byStatus("pending");
    const inProgress  = byStatus("in_progress");
    const completed   = byStatus("completed");
    const blocked     = todos.filter(t => t.status !== "pending" && t.status !== "in_progress" && t.status !== "completed");

    const hasTodos = todos.length > 0;

    return (
        <div className="flex flex-col bg-[#09090b] text-white overflow-hidden" style={{ overflowX: "hidden", height: "100dvh", maxHeight: "-webkit-fill-available" }}>

            {/* ── Voice Modal ── */}
            {showVoice && connected && (
                <VoiceModal
                    onSubmit={(text) => {
                        setInputText(text);
                        // Directly inject
                        injectedMsgs.current.add(text);
                        addActivity({ type: "user_msg", content: text, timestamp: new Date().toISOString() });
                        fetch(`/api/claude/claude-sessions/${meta.sessionId}/input`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ text }),
                        }).then(r => r.json()).then(data => {
                            if (!data.ok) addActivity({ type: "text", content: "Voice injection failed - is Claude Code running?", timestamp: new Date().toISOString() });
                        }).catch(() => {});
                        setInputText("");
                    }}
                    onClose={() => setShowVoice(false)}
                />
            )}

            {/* ── QR Modal ── */}
            {showQr && pageUrl && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowQr(false)}>
                    <div className="w-full max-w-xs rounded-2xl p-6" style={{ background: "#1c1c1e", border: "1px solid rgba(255,255,255,0.1)" }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-bold text-white">LAN Access</span>
                            <button onClick={() => setShowQr(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", display: "flex" }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        </div>
                        <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            <img src={`/api/qr?url=${encodeURIComponent(pageUrl)}`} alt="QR" className="w-full rounded-lg" />
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            <span className="text-xs font-mono text-white/60 flex-1 truncate">{pageUrl}</span>
                            <button onClick={() => { navigator.clipboard.writeText(pageUrl); }} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", display: "flex", padding: 2 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                            </button>
                        </div>
                        <p className="text-[10px] text-white/30 text-center">Scan with your phone on the same network</p>
                    </div>
                </div>
            )}

            {/* ── Header ── */}
            <div className="shrink-0 px-6 pt-5 pb-4 border-b border-white/5 space-y-4">
                {/* Top row */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="min-w-0">
                            <h1 className="text-lg font-bold text-white leading-tight truncate" style={{ maxWidth: "60vw" }}>
                                {(meta.customTitle || lastUserMsg || meta.sessionId.slice(0, 16) + "…").slice(0, 50)}
                            </h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {/* Voice input - only when session is active */}
                        {connected && (
                            <button
                                onClick={() => setShowVoice(true)}
                                className="opacity-60 hover:opacity-100 transition-opacity duration-300"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#f97316", display: "flex", padding: 4 }}
                                title="Voice input">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                    <line x1="12" x2="12" y1="19" y2="22"/>
                                </svg>
                            </button>
                        )}
                        {/* QR code */}
                        {pageUrl && (
                            <div className="opacity-60 hover:opacity-100 transition-opacity duration-300 cursor-pointer"
                                onClick={() => setShowQr(true)}
                                title="Scan QR to open on phone">
                                <img src={`/api/qr?url=${encodeURIComponent(pageUrl)}`} alt="QR" width={28} height={28} className="rounded" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Activity feed ── */}
            <div
                ref={feedRef}
                className="flex-1 overflow-y-auto p-4 space-y-2"
                style={{ scrollbarWidth: "none" }}
            >
                {activity.length === 0 && (
                    <div className="text-[11px] text-white/25 text-center py-16 space-y-2">
                        <Loader2 size={20} className="mx-auto animate-spin text-white/15" />
                        <p>Streaming session data…</p>
                        <p className="text-[10px]">Past events will appear here, new events stream live</p>
                    </div>
                )}
                <div className="space-y-2">
                    {[...activity].reverse().map((item, i, arr) => (
                        <ActivityRow
                            key={item.id}
                            item={item}
                            isLatest={i === arr.length - 1 && active}
                            showToast={showToast}
                        />
                    ))}
                </div>
            </div>

            {/* ── Ant march - loading indicator ── */}
            {active && connected && antCount > 0 && (
                <div className="shrink-0 px-3 pt-2 pb-1" style={{ background: "#09090b" }}>
                    <div ref={antRowRef} className="flex items-center gap-2">
                        <span className="text-[9px] font-bold tracking-wider shrink-0 animate-pulse" style={{ color: "rgba(255,255,255,0.3)" }}>
                            {thinkingState ? "Thinking..." : "Working..."}
                        </span>
                        <div className="flex items-end gap-0 flex-1 overflow-hidden" style={{ animation: "claudeMarch 10s linear infinite" }}>
                            {Array.from({ length: antCount }).map((_, i) => {
                                const hue = (i * 35) % 360;
                                return (
                                    <img key={i} src="/claude-logo.png" alt="" width={20} height={20}
                                        style={{
                                            imageRendering: "pixelated",
                                            opacity: 0.7,
                                            animation: `antStep 0.4s ease-in-out infinite`,
                                            animationDelay: `${i * 0.1}s`,
                                            filter: `brightness(0.7) sepia(1) saturate(5) hue-rotate(${hue}deg)`,
                                        }} />
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Input box - fixed bottom ── */}
            <div className="shrink-0 px-3 pt-2 pb-2 border-t border-white/5" style={{ background: "#09090b" }}>
                <div className="flex items-end gap-2"
                    style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 16, padding: "8px 8px 8px 14px" }}
                >
                    <div
                        ref={inputRef as any}
                        contentEditable
                        suppressContentEditableWarning
                        role="textbox"
                        onInput={e => setInputText((e.target as HTMLDivElement).textContent || "")}
                        onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                sendInput();
                                (e.target as HTMLDivElement).textContent = "";
                            }
                        }}
                        onFocus={() => setTimeout(() => (inputRef.current as any)?.scrollIntoView({ behavior: "smooth", block: "end" }), 300)}
                        data-placeholder="Message Claude..."
                        className="flex-1 bg-transparent text-[16px] text-white/80 leading-relaxed self-center empty:before:content-[attr(data-placeholder)] empty:before:text-white/25"
                        style={{ outline: "none", border: "none", boxShadow: "none", maxHeight: 120, overflowY: "auto", scrollbarWidth: "none", fontSize: 16, minHeight: 24, wordBreak: "break-word" }}
                    />
                    <button
                        onClick={() => {
                            sendInput();
                            if (inputRef.current) (inputRef.current as any).textContent = "";
                        }}
                        disabled={!inputText.trim() || sending || !connected}
                        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition disabled:opacity-70"
                        style={{ background: "#3b82f6", boxShadow: "0 0 16px rgba(59,130,246,0.5)", zIndex: 9999, position: "relative" }}
                    >
                        <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                            <path d="M6 10V2M6 2L2 6M6 2L10 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>

            {/* Confetti burst when ants die */}
            {confetti.length > 0 && typeof document !== "undefined" && createPortal(
                <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483647 }}>
                    {confetti.map(p => {
                        const colors = ["#f87171","#fb923c","#facc15","#4ade80","#22d3ee","#60a5fa","#a78bfa","#f472b6","#34d399","#c084fc"];
                        return Array.from({ length: 12 }, (_, j) => {
                            const angle = (j / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
                            const dist = 40 + Math.random() * 60;
                            const rotation = Math.floor(Math.random() * 720 - 360);
                            return (
                                <div key={`${p.id}-${j}`} className="confetti-particle"
                                    style={{
                                        left: p.x, top: p.y,
                                        background: colors[j % colors.length],
                                        "--cx": `${Math.cos(angle) * dist}px`,
                                        "--cy": `${Math.sin(angle) * dist - 30}px`,
                                        "--cr": `${rotation}deg`,
                                    } as React.CSSProperties} />
                            );
                        });
                    })}
                </div>,
                document.body
            )}
        </div>
    );
}
