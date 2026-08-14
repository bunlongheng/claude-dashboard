"use client";

import { memo, useMemo } from "react";
import { marked } from "marked";
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
    Zap, Terminal, FileText, Search, Edit3, Bot, Eye,
    MessageSquare, Brain,
} from "lucide-react";
import { timeAgo } from "../../_sections/shared";
import type { ActivityItem } from "./types";

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

function shortTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    if (isToday) return time;
    const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${date} ${time}`;
}

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

export const ActivityRow = memo(function ActivityRow({ item, isLatest, showToast }: { item: ActivityItem; isLatest: boolean; showToast: (msg: string, color?: string) => void }) {
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
                <span className="ml-auto text-[9px] font-mono text-white/20 shrink-0">{shortTime(item.timestamp)} <span className="text-white/10">{timeAgo(item.timestamp)}</span></span>
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
});
