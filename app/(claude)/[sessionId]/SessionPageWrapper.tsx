"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import SessionProgressClient from "./SessionProgressClient";
import SessionReplay from "../_sections/SessionReplay";

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
    todos: { id: string; subject: string; status: string; description?: string; activeForm?: string }[];
    lastUsage: {
        input_tokens: number;
        output_tokens: number;
        cache_read: number;
        cache_creation: number;
        model: string;
    } | null;
    messageCount: number;
}

export default function SessionPageWrapper({ meta }: { meta: SessionMeta }) {
    const [showReplay, setShowReplay] = useState(false);

    return (
        <div className="relative h-[calc(100vh-160px)]">
            {/* Replay toggle button — fixed in top-right area */}
            {!showReplay && (
                <button
                    onClick={() => setShowReplay(true)}
                    className="absolute top-3 right-20 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide uppercase transition cursor-pointer"
                    style={{
                        background: "rgba(74,222,128,0.1)",
                        border: "1px solid rgba(74,222,128,0.25)",
                        color: "#4ade80",
                    }}
                >
                    <Play size={10} />
                    Replay
                </button>
            )}

            {/* Main content area */}
            {showReplay ? (
                <div className="h-full bg-[#09090b] text-white">
                    <SessionReplay sessionId={meta.sessionId} onClose={() => setShowReplay(false)} />
                </div>
            ) : (
                <SessionProgressClient meta={meta} />
            )}
        </div>
    );
}
