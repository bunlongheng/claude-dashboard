"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Search, X, FolderOpen, Brain, BookOpen,
    Sparkles, Terminal, Webhook, Settings, Command,
} from "lucide-react";

type Result = { title: string; description: string; path: string; type: string };
type SearchResults = {
    sessions: Result[]; memory: Result[]; claudemd: Result[];
    skills: Result[]; commands: Result[]; hooks: Result[]; settings: Result[];
};

const TYPE_META: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
    sessions: { label: "Sessions", Icon: FolderOpen, color: "#22c55e" },
    memory:   { label: "Memory",   Icon: Brain,      color: "#eab308" },
    claudemd: { label: "CLAUDE.md", Icon: BookOpen,  color: "#8b5cf6" },
    skills:   { label: "Skills",   Icon: Sparkles,   color: "#06b6d4" },
    commands: { label: "Commands", Icon: Terminal,    color: "#f472b6" },
    hooks:    { label: "Hooks",    Icon: Webhook,     color: "#a3e635" },
    settings: { label: "Settings", Icon: Settings,    color: "#6b7280" },
};

const GROUP_ORDER = ["claudemd", "memory", "skills", "commands", "hooks", "sessions", "settings"];

export default function SearchModal() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResults | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeIdx, setActiveIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Flatten results for keyboard nav
    const flatResults: Result[] = results
        ? GROUP_ORDER.flatMap(key => (results as any)[key] ?? [])
        : [];

    // Cmd+K / Ctrl+K
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setOpen(prev => !prev);
            }
        };
        const customHandler = () => setOpen(true);
        window.addEventListener("keydown", handler);
        window.addEventListener("open-search", customHandler);
        return () => {
            window.removeEventListener("keydown", handler);
            window.removeEventListener("open-search", customHandler);
        };
    }, []);

    // Focus input on open
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery("");
            setResults(null);
            setActiveIdx(0);
        }
    }, [open]);

    // Debounced search
    const doSearch = useCallback(async (q: string) => {
        if (q.length < 2) { setResults(null); setLoading(false); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/claude/search?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            setResults(data);
            setActiveIdx(0);
        } catch { setResults(null); }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => doSearch(query), 200);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [query, doSearch]);

    // Navigate on select
    const handleSelect = useCallback((result: Result) => {
        setOpen(false);
        router.push(result.path);
    }, [router]);

    // Keyboard nav
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") { setOpen(false); return; }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx(i => Math.min(i + 1, flatResults.length - 1));
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx(i => Math.max(i - 1, 0));
        }
        if (e.key === "Enter" && flatResults[activeIdx]) {
            handleSelect(flatResults[activeIdx]);
        }
    };

    if (!open) return null;

    const hasResults = flatResults.length > 0;
    const totalCount = flatResults.length;

    return (
        <div
            ref={backdropRef}
            onClick={(e) => { if (e.target === backdropRef.current) setOpen(false); }}
            style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
                display: "flex", alignItems: "flex-start", justifyContent: "center",
                paddingTop: "min(20vh, 160px)",
                animation: "searchFadeIn 0.15s ease-out",
            }}
        >
            <style>{`
                @keyframes searchFadeIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .search-result-item:hover { background: rgba(255,255,255,0.06) !important; }
            `}</style>

            <div style={{
                width: "100%", maxWidth: 560,
                background: "#0e1017",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
                overflow: "hidden",
            }}>
                {/* Search input */}
                <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "14px 16px",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                }}>
                    <Search size={16} style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search sessions, memory, skills, commands..."
                        style={{
                            flex: 1, background: "none", border: "none", outline: "none",
                            color: "#ffffff", fontSize: 14, fontFamily: "inherit",
                        }}
                    />
                    <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                    }}>
                        {query && (
                            <button onClick={() => setQuery("")} style={{
                                background: "none", border: "none", cursor: "pointer",
                                color: "rgba(255,255,255,0.3)", display: "flex", padding: 2,
                            }}>
                                <X size={14} />
                            </button>
                        )}
                        <kbd style={{
                            fontSize: 10, padding: "2px 6px", borderRadius: 4,
                            background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)",
                            border: "1px solid rgba(255,255,255,0.08)", fontFamily: "inherit",
                        }}>ESC</kbd>
                    </div>
                </div>

                {/* Results */}
                <div style={{ maxHeight: 400, overflowY: "auto", padding: "4px 0" }}>
                    {loading && query.length >= 2 && (
                        <div style={{ padding: "20px 16px", color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center" }}>
                            Searching...
                        </div>
                    )}

                    {!loading && query.length >= 2 && !hasResults && (
                        <div style={{ padding: "20px 16px", color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center" }}>
                            No results for &ldquo;{query}&rdquo;
                        </div>
                    )}

                    {!loading && query.length < 2 && (
                        <div style={{ padding: "20px 16px", color: "rgba(255,255,255,0.25)", fontSize: 12, textAlign: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                                <Command size={12} />
                                <span>Type to search across your Claude configuration</span>
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>
                                Sessions, memory, CLAUDE.md, skills, commands, hooks, settings
                            </div>
                        </div>
                    )}

                    {hasResults && (() => {
                        let globalIdx = 0;
                        return GROUP_ORDER.map(key => {
                            const items: Result[] = (results as any)[key] ?? [];
                            if (items.length === 0) return null;
                            const meta = TYPE_META[key];
                            const GroupIcon = meta.Icon;
                            const startIdx = globalIdx;
                            globalIdx += items.length;

                            return (
                                <div key={key} style={{ marginBottom: 4 }}>
                                    {/* Group header */}
                                    <div style={{
                                        display: "flex", alignItems: "center", gap: 6,
                                        padding: "6px 16px 4px",
                                        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                                        color: meta.color, textTransform: "uppercase",
                                    }}>
                                        <GroupIcon size={12} />
                                        <span>{meta.label}</span>
                                        <span style={{ fontSize: 9, opacity: 0.5 }}>({items.length})</span>
                                    </div>

                                    {/* Items */}
                                    {items.map((item, i) => {
                                        const idx = startIdx + i;
                                        const isActive = idx === activeIdx;
                                        return (
                                            <button
                                                key={`${key}-${i}`}
                                                className="search-result-item"
                                                onClick={() => handleSelect(item)}
                                                style={{
                                                    display: "flex", flexDirection: "column", gap: 2,
                                                    width: "100%", textAlign: "left",
                                                    padding: "8px 16px 8px 34px",
                                                    background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                                                    border: "none", cursor: "pointer",
                                                    borderLeft: isActive ? `2px solid ${meta.color}` : "2px solid transparent",
                                                    transition: "background 0.1s",
                                                }}
                                            >
                                                <span style={{ fontSize: 13, fontWeight: 500, color: "#ffffff" }}>
                                                    {item.title}
                                                </span>
                                                {item.description && (
                                                    <span style={{
                                                        fontSize: 11, color: "rgba(255,255,255,0.35)",
                                                        overflow: "hidden", textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap", maxWidth: "100%",
                                                    }}>
                                                        {item.description}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        });
                    })()}
                </div>

                {/* Footer */}
                {hasResults && (
                    <div style={{
                        padding: "8px 16px",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        fontSize: 10, color: "rgba(255,255,255,0.2)",
                    }}>
                        <span>{totalCount} result{totalCount !== 1 ? "s" : ""}</span>
                        <div style={{ display: "flex", gap: 8 }}>
                            <span><kbd style={{ padding: "1px 4px", borderRadius: 3, background: "rgba(255,255,255,0.06)", fontSize: 9 }}>↑↓</kbd> navigate</span>
                            <span><kbd style={{ padding: "1px 4px", borderRadius: 3, background: "rgba(255,255,255,0.06)", fontSize: 9 }}>↵</kbd> open</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

