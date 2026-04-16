"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
    Play, Pause, Square, SkipForward,
    Terminal, FileText, Search, Edit3, Bot, Zap, Eye,
    MessageSquare, Brain, Loader2, X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReplayBlock {
    type: string;
    text?: string;
    name?: string;
    summary?: string;
    length?: number;
}

interface ReplayEvent {
    type: string;
    data: {
        text?: string;
        blocks?: ReplayBlock[];
        model?: string;
        title?: string;
        summary?: Record<string, unknown>;
        timestamp?: string;
        [key: string]: unknown;
    };
    timestamp: string;
    delay: number;
    index: number;
}

type PlayState = "idle" | "playing" | "paused";

const TOOL_COLORS: Record<string, { icon: React.ElementType; color: string }> = {
    Bash:      { icon: Terminal, color: "#22d3ee" },
    Read:      { icon: FileText, color: "#60a5fa" },
    Edit:      { icon: Edit3,    color: "#f97316" },
    Write:     { icon: Edit3,    color: "#c084fc" },
    Grep:      { icon: Search,   color: "#f472b6" },
    Glob:      { icon: Search,   color: "#fb923c" },
    Agent:     { icon: Bot,      color: "#4ade80" },
    WebFetch:  { icon: Eye,      color: "#facc15" },
    WebSearch: { icon: Eye,      color: "#facc15" },
};

const SPEED_OPTIONS = [1, 2, 5, 10] as const;

// ─── Typing text component ──────────────────────────────────────────────────

function TypingText({ text, speed }: { text: string; speed: number }) {
    const [displayed, setDisplayed] = useState("");
    const idxRef = useRef(0);
    const words = text.split(/(\s+)/);

    useEffect(() => {
        idxRef.current = 0;
        setDisplayed("");
        const baseInterval = 30 / speed;
        const timer = setInterval(() => {
            idxRef.current += 1;
            if (idxRef.current >= words.length) {
                setDisplayed(text);
                clearInterval(timer);
                return;
            }
            setDisplayed(words.slice(0, idxRef.current).join(""));
        }, baseInterval);
        return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text, speed]);

    return <>{displayed}</>;
}

// ─── Rendered event ─────────────────────────────────────────────────────────

function ReplayEventBubble({ event, isAnimating, speed }: {
    event: ReplayEvent;
    isAnimating: boolean;
    speed: number;
}) {
    if (event.type === "user_message") {
        return (
            <div className="flex justify-end">
                <div
                    className="px-3.5 py-2.5 rounded-2xl rounded-tr-sm max-w-[85%]"
                    style={{ background: "#0b84fe" }}
                >
                    <p className="text-[12px] text-white font-medium leading-relaxed break-words">
                        {event.data.text || ""}
                    </p>
                </div>
            </div>
        );
    }

    if (event.type === "assistant_message") {
        const blocks = event.data.blocks ?? [];
        return (
            <div className="space-y-2">
                {blocks.map((block, i) => {
                    if (block.type === "thinking") {
                        return (
                            <div key={i} className="px-3 py-2 rounded-lg" style={{ background: "#1c1c1e" }}>
                                <div className="flex items-center gap-2 mb-1">
                                    <Brain size={10} className="text-orange-400" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-orange-400">Thinking</span>
                                    <span className="text-[9px] text-white/20 font-mono">{block.length?.toLocaleString()} chars</span>
                                </div>
                                <p className="text-[10px] text-white/30 italic">Extended thinking...</p>
                            </div>
                        );
                    }
                    if (block.type === "text") {
                        return (
                            <div key={i} className="px-3 py-2.5 rounded-lg" style={{ background: "#1c1c1e" }}>
                                <div className="flex items-center gap-2 mb-1">
                                    <MessageSquare size={10} className="text-blue-400" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400">Response</span>
                                </div>
                                <p className="text-[11px] text-white/75 leading-relaxed break-words whitespace-pre-wrap">
                                    {isAnimating ? (
                                        <TypingText text={block.text ?? ""} speed={speed} />
                                    ) : (
                                        block.text ?? ""
                                    )}
                                </p>
                            </div>
                        );
                    }
                    if (block.type === "tool_use") {
                        const tool = TOOL_COLORS[block.name ?? ""] ?? { icon: Zap, color: "#94a3b8" };
                        const Icon = tool.icon;
                        return (
                            <div key={i} className="px-3 py-2 rounded-lg" style={{ background: "#1c1c1e" }}>
                                <div className="flex items-center gap-2 mb-1">
                                    <Icon size={10} style={{ color: tool.color }} />
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: tool.color }}>
                                        {block.name}
                                    </span>
                                </div>
                                <pre className="text-[10px] text-white/50 font-mono leading-relaxed overflow-auto max-h-[120px] break-all whitespace-pre-wrap"
                                    style={{ background: "rgba(0,0,0,0.3)", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
                                    {block.summary || "..."}
                                </pre>
                            </div>
                        );
                    }
                    return null;
                })}
                {event.data.model && (
                    <span className="text-[9px] text-white/15 font-mono pl-3">
                        {String(event.data.model).replace("claude-", "").replace(/-(\d)/, " $1")}
                    </span>
                )}
            </div>
        );
    }

    if (event.type === "summary") {
        return (
            <div className="px-3 py-2 rounded-lg text-center" style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.15)" }}>
                <span className="text-[9px] font-bold uppercase tracking-wider text-yellow-400">Context Summary</span>
            </div>
        );
    }

    if (event.type === "custom_title") {
        return (
            <div className="px-3 py-2 rounded-lg text-center" style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)" }}>
                <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400">Title: </span>
                <span className="text-[11px] text-white/60">{event.data.title}</span>
            </div>
        );
    }

    // Fallback
    return null;
}

// ─── Main Replay Component ──────────────────────────────────────────────────

export default function SessionReplay({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
    const [events, setEvents] = useState<ReplayEvent[]>([]);
    const [totalEvents, setTotalEvents] = useState(0);
    const [totalDuration, setTotalDuration] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [playState, setPlayState] = useState<PlayState>("idle");
    const [currentIdx, setCurrentIdx] = useState(0);
    const [speed, setSpeed] = useState(2);

    const feedRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const playStateRef = useRef<PlayState>("idle");
    const currentIdxRef = useRef(0);
    const speedRef = useRef(2);

    // Keep refs in sync
    useEffect(() => { playStateRef.current = playState; }, [playState]);
    useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
    useEffect(() => { speedRef.current = speed; }, [speed]);

    // Fetch replay data
    useEffect(() => {
        let cancelled = false;
        async function fetchReplay() {
            try {
                const res = await fetch(`/api/claude/claude-sessions/${sessionId}/replay`);
                if (!res.ok) throw new Error("Failed to load replay data");
                const data = await res.json();
                if (cancelled) return;
                setEvents(data.events ?? []);
                setTotalEvents(data.totalEvents ?? 0);
                setTotalDuration(data.totalDurationFormatted ?? "");
                setLoading(false);
            } catch (e) {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : "Unknown error");
                setLoading(false);
            }
        }
        fetchReplay();
        return () => { cancelled = true; };
    }, [sessionId]);

    // Auto-scroll
    useEffect(() => {
        const el = feedRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [currentIdx]);

    // Play logic
    const playNext = useCallback(() => {
        if (playStateRef.current !== "playing") return;
        const idx = currentIdxRef.current;
        if (idx >= events.length) {
            setPlayState("idle");
            return;
        }

        setCurrentIdx(idx + 1);

        if (idx + 1 < events.length) {
            const nextEvent = events[idx + 1];
            // Clamp delay: min 50ms, max 5000ms, then divide by speed
            const rawDelay = Math.min(Math.max(nextEvent.delay, 50), 5000);
            const scaledDelay = rawDelay / speedRef.current;
            timerRef.current = setTimeout(playNext, scaledDelay);
        } else {
            setPlayState("idle");
        }
    }, [events]);

    const handlePlay = useCallback(() => {
        if (playState === "playing") return;
        if (currentIdx >= events.length) {
            // Restart from beginning
            setCurrentIdx(0);
            currentIdxRef.current = 0;
        }
        setPlayState("playing");
        playStateRef.current = "playing";
        // Kick off immediately
        setTimeout(playNext, 50);
    }, [playState, currentIdx, events.length, playNext]);

    const handlePause = useCallback(() => {
        setPlayState("paused");
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const handleStop = useCallback(() => {
        setPlayState("idle");
        setCurrentIdx(0);
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const handleSkip = useCallback(() => {
        if (currentIdx < events.length) {
            setCurrentIdx(prev => Math.min(prev + 1, events.length));
        }
    }, [currentIdx, events.length]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const progress = events.length > 0 ? (currentIdx / events.length) * 100 : 0;
    const visibleEvents = events.slice(0, currentIdx);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 size={24} className="animate-spin text-white/30" />
                <p className="text-[11px] text-white/30">Loading replay data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <p className="text-[11px] text-red-400">{error}</p>
                <button onClick={onClose} className="text-[10px] text-white/40 hover:text-white/60 underline">Close</button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header bar */}
            <div className="shrink-0 px-4 py-3 border-b border-white/5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-white/40">Session Replay</span>
                        <span className="text-[9px] font-mono text-white/20">{totalEvents} events</span>
                        {totalDuration && <span className="text-[9px] font-mono text-white/20">{totalDuration}</span>}
                    </div>
                </div>
                <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white/60 transition cursor-pointer">
                    <X size={14} />
                </button>
            </div>

            {/* Controls */}
            <div className="shrink-0 px-4 py-2.5 border-b border-white/5 space-y-2">
                <div className="flex items-center gap-2">
                    {/* Play / Pause */}
                    {playState === "playing" ? (
                        <button onClick={handlePause}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer"
                            style={{ background: "rgba(250,204,21,0.15)", border: "1px solid rgba(250,204,21,0.3)" }}>
                            <Pause size={12} className="text-yellow-400" />
                        </button>
                    ) : (
                        <button onClick={handlePlay}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer"
                            style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)" }}>
                            <Play size={12} className="text-green-400" />
                        </button>
                    )}
                    {/* Stop */}
                    <button onClick={handleStop}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer"
                        style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}>
                        <Square size={10} className="text-red-400" />
                    </button>
                    {/* Skip */}
                    <button onClick={handleSkip}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        <SkipForward size={12} className="text-white/40" />
                    </button>

                    {/* Speed */}
                    <div className="flex items-center gap-1 ml-2">
                        {SPEED_OPTIONS.map(s => (
                            <button key={s} onClick={() => setSpeed(s)}
                                className="px-2 py-0.5 rounded text-[9px] font-bold transition cursor-pointer"
                                style={{
                                    background: speed === s ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.04)",
                                    border: `1px solid ${speed === s ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.08)"}`,
                                    color: speed === s ? "#60a5fa" : "rgba(255,255,255,0.35)",
                                }}>
                                {s}x
                            </button>
                        ))}
                    </div>

                    {/* Counter */}
                    <span className="ml-auto text-[10px] font-mono text-white/25">
                        {currentIdx} / {events.length}
                    </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                        className="h-full rounded-full transition-all duration-150"
                        style={{ width: `${progress}%`, background: "linear-gradient(90deg, #3b82f6, #60a5fa)" }}
                    />
                </div>
            </div>

            {/* Event feed */}
            <div
                ref={feedRef}
                className="flex-1 overflow-y-auto p-4 space-y-2.5"
                style={{ scrollbarWidth: "none" }}
            >
                {visibleEvents.length === 0 && playState === "idle" && (
                    <div className="text-center py-16 space-y-2">
                        <Play size={20} className="mx-auto text-white/15" />
                        <p className="text-[11px] text-white/25">Press play to start the session replay</p>
                        <p className="text-[10px] text-white/15">{events.length} events ready</p>
                    </div>
                )}
                {visibleEvents.map((event, i) => (
                    <ReplayEventBubble
                        key={event.index}
                        event={event}
                        isAnimating={i === visibleEvents.length - 1 && playState === "playing"}
                        speed={speed}
                    />
                ))}
                {playState === "playing" && currentIdx < events.length && (
                    <div className="flex items-center gap-2 px-3 py-2">
                        <Loader2 size={10} className="animate-spin text-white/20" />
                        <span className="text-[9px] text-white/20 animate-pulse">Playing...</span>
                    </div>
                )}
            </div>
        </div>
    );
}
