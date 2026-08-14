"use client";

import { memo } from "react";
import Image from "next/image";

export const SessionHeader = memo(function SessionHeader({
    title, connected, pageUrl, onVoiceClick, onQrClick,
}: {
    title: string;
    connected: boolean;
    pageUrl: string;
    onVoiceClick: () => void;
    onQrClick: () => void;
}) {
    return (
        <div className="shrink-0 px-6 pt-5 pb-4 border-b border-white/5 space-y-4">
            {/* Top row */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold text-white leading-tight truncate" style={{ maxWidth: "60vw" }}>
                            {title}
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Voice input - only when session is active */}
                    {connected && (
                        <button
                            onClick={onVoiceClick}
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
                            onClick={onQrClick}
                            title="Scan QR to open on phone">
                            {/* /api/qr returns a dynamic SVG; unoptimized keeps the exact same raw-fetch behavior as the previous <img> */}
                            <Image src={`/api/qr?url=${encodeURIComponent(pageUrl)}`} alt="QR" width={28} height={28} unoptimized priority className="rounded" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});
