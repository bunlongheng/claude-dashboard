"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import VoiceModal from "../_sections/VoiceModal";
import { useMachine } from "../_sections/MachineContext";
import { useToast } from "../_sections/ToastContext";
import type { TodoItem, UsageState, ActivityItem, SessionMeta } from "./session/types";
import { ActivityFeed } from "./session/ActivityFeed";
import { QrModal } from "./session/QrModal";
import { SessionHeader } from "./session/SessionHeader";
import { AntMarch } from "./session/AntMarch";
import { InputBar } from "./session/InputBar";
import { ConfettiOverlay } from "./session/ConfettiOverlay";

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SessionProgressClient({ meta }: { meta: SessionMeta }) {
    const { apiBase } = useMachine();
    const { showToast } = useToast();
    const [todos, setTodos] = useState<TodoItem[]>(meta.todos);
    const [usage, setUsage] = useState<UsageState | null>(meta.lastUsage);
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [lastUserMsg, setLastUserMsg] = useState<string>(meta.firstMessage || "");
    const [customTitle, setCustomTitle] = useState<string>(meta.customTitle || "");
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
    // Bounded add: drop oldest entries if SSE never echoes them back (e.g. session
    // crashed, message merged). Sets preserve insertion order so values().next() is FIFO.
    const trackInjected = useCallback((text: string) => {
        injectedMsgs.current.add(text);
        while (injectedMsgs.current.size > 200) {
            const oldest = injectedMsgs.current.values().next().value;
            if (oldest === undefined) break;
            injectedMsgs.current.delete(oldest);
        }
    }, []);

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
        fetch(apiBase("/api/claude/lan"))
            .then(r => r.json())
            .then(d => setPageUrl(`http://${d.ip}:${d.port}/${meta.sessionId}`))
            .catch(() => {
                const base = `${window.location.protocol}//${window.location.host}`;
                setPageUrl(`${base}/${meta.sessionId}`);
            });
    }, [meta.sessionId, apiBase]);

    const [inputText, setInputText] = useState("");
    const [sending, setSending] = useState(false);
    const inputRef = useRef<HTMLDivElement>(null);

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
        if (!active || !connected) return;
        // Immediate first tick avoids a 1s flash of zero ants when the indicator
        // becomes active; deferring into setInterval's callback would delay it by
        // a full second, so there's no clean alternative that keeps identical timing.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAntCount(1);
        const t = setInterval(() => setAntCount(c => Math.min(c + 1, 40)), 1000);
        return () => { clearInterval(t); setAntCount(0); };
    }, [active, connected]);

    const sendInput = useCallback(async () => {
        const text = inputText.trim();
        if (!text) return;
        // Optimistic bubble immediately + track to skip SSE echo
        trackInjected(text);
        addActivity({ type: "user_msg", content: text, timestamp: new Date().toISOString() });
        setInputText("");
        inputRef.current?.focus();
        // POST via Next.js proxy (avoids LAN port issues)
        try {
            const res = await fetch(apiBase(`/api/claude/claude-sessions/${meta.sessionId}/input`), {
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
    }, [inputText, addActivity, meta.sessionId, apiBase, trackInjected]);

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
            es = new EventSource(apiBase(`/api/claude/claude-sessions/${meta.sessionId}/stream`));

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
            es.addEventListener("custom_title", (e) => {
                const data = JSON.parse(e.data);
                if (data.customTitle) setCustomTitle(data.customTitle);
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
    }, [meta.sessionId, addActivity, apiBase]);

    const title = (customTitle || lastUserMsg || meta.sessionId.slice(0, 16) + "…").slice(0, 50);

    return (
        <div className="flex flex-col bg-[#09090b] text-white overflow-hidden" style={{ overflowX: "hidden", height: "100dvh", maxHeight: "-webkit-fill-available" }}>

            {/* ── Voice Modal ── */}
            {showVoice && connected && (
                <VoiceModal
                    onSubmit={(text) => {
                        setInputText(text);
                        // Directly inject
                        trackInjected(text);
                        addActivity({ type: "user_msg", content: text, timestamp: new Date().toISOString() });
                        fetch(apiBase(`/api/claude/claude-sessions/${meta.sessionId}/input`), {
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
                <QrModal pageUrl={pageUrl} onClose={() => setShowQr(false)} />
            )}

            {/* ── Header ── */}
            <SessionHeader
                title={title}
                connected={connected}
                pageUrl={pageUrl}
                onVoiceClick={() => setShowVoice(true)}
                onQrClick={() => setShowQr(true)}
            />

            {/* ── Activity feed ── */}
            <div
                ref={feedRef}
                className="flex-1 overflow-y-auto p-4 space-y-2"
                style={{ scrollbarWidth: "none" }}
            >
                <ActivityFeed activity={activity} active={active} showToast={showToast} />
            </div>

            {/* ── Ant march - loading indicator ── */}
            {active && connected && antCount > 0 && (
                <AntMarch thinking={!!thinkingState} antCount={antCount} containerRef={antRowRef} />
            )}

            {/* ── Input box - fixed bottom ── */}
            <InputBar
                inputRef={inputRef}
                inputText={inputText}
                sending={sending}
                connected={connected}
                onInputChange={setInputText}
                onSend={sendInput}
            />

            {/* Confetti burst when ants die */}
            <ConfettiOverlay confetti={confetti} />
        </div>
    );
}
