"use client";

import { memo } from "react";
import Image from "next/image";

export const QrModal = memo(function QrModal({ pageUrl, onClose }: { pageUrl: string; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-xs rounded-2xl p-6" style={{ background: "#1c1c1e", border: "1px solid rgba(255,255,255,0.1)" }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-bold text-white">LAN Access</span>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", display: "flex" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
                <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {/* /api/qr returns a dynamic SVG; unoptimized keeps the exact same raw-fetch behavior as the previous <img> */}
                    <Image src={`/api/qr?url=${encodeURIComponent(pageUrl)}`} alt="QR" width={280} height={280} unoptimized priority className="w-full rounded-lg" />
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
    );
});
