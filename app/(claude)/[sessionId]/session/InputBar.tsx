"use client";

import { memo, type RefObject } from "react";

export const InputBar = memo(function InputBar({
    inputRef, inputText, sending, connected, onInputChange, onSend,
}: {
    inputRef: RefObject<HTMLDivElement | null>;
    inputText: string;
    sending: boolean;
    connected: boolean;
    onInputChange: (text: string) => void;
    onSend: () => void;
}) {
    return (
        <div className="shrink-0 px-3 pt-2 pb-2 border-t border-white/5" style={{ background: "#09090b" }}>
            <div className="flex items-end gap-2"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 16, padding: "8px 8px 8px 14px" }}
            >
                <div
                    ref={inputRef}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    onInput={e => onInputChange((e.target as HTMLDivElement).textContent || "")}
                    onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            onSend();
                            (e.target as HTMLDivElement).textContent = "";
                        }
                    }}
                    onFocus={() => setTimeout(() => inputRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 300)}
                    data-placeholder="Message Claude..."
                    className="flex-1 bg-transparent text-[16px] text-white/80 leading-relaxed self-center empty:before:content-[attr(data-placeholder)] empty:before:text-white/25"
                    style={{ outline: "none", border: "none", boxShadow: "none", maxHeight: 120, overflowY: "auto", scrollbarWidth: "none", fontSize: 16, minHeight: 24, wordBreak: "break-word" }}
                />
                <button
                    onClick={() => {
                        onSend();
                        if (inputRef.current) inputRef.current.textContent = "";
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
    );
});
