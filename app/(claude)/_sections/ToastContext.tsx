"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ToastCtx = { showToast: (msg: string, color?: string) => void };
const Ctx = createContext<ToastCtx>({ showToast: () => {} });

export function useToast() { return useContext(Ctx); }

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toast, setToast] = useState<{ msg: string; color: string; key: number } | null>(null);

    const showToast = useCallback((msg: string, color = "#34d399") => {
        setToast({ msg, color, key: Date.now() });
        setTimeout(() => setToast(null), 2200);
    }, []);

    return (
        <Ctx.Provider value={{ showToast }}>
            {children}
            {toast && typeof document !== "undefined" && createPortal(
                <div key={toast.key} className="fixed top-6 left-1/2 -translate-x-1/2 z-[2147483647]"
                    style={{ animation: "toastInOut 2.2s cubic-bezier(0.16,1,0.3,1) forwards" }}>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                        style={{
                            background: toast.color,
                            border: `1px solid ${toast.color}99`,
                            boxShadow: `0 8px 26px ${toast.color}66`,
                            color: "#fff",
                        }}>
                        <span style={{
                            width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.15)",
                            display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </span>
                        <span className="font-black uppercase tracking-wide text-[8px] leading-snug">{toast.msg}</span>
                    </div>
                </div>,
                document.body
            )}
            <style jsx global>{`
                @keyframes toastInOut {
                    0% { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.8); }
                    12% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                    80% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                    100% { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.95); }
                }
            `}</style>
        </Ctx.Provider>
    );
}
