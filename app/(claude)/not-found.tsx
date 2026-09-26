import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
    return (
        <div className="flex flex-col items-center text-center gap-3 rounded-2xl px-7 py-14" style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 60%, rgba(8,9,13,0.9) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
        }}>
            <SearchX size={32} style={{ color: "rgba(255,255,255,0.4)" }} />
            <h1 className="text-2xl font-bold text-white m-0">Page not found</h1>
            <p className="text-[13px] font-medium m-0" style={{ color: "rgba(255,255,255,0.52)" }}>No section lives at this address.</p>
            <Link href="/dashboard" className="mt-3 px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-[0.1em] text-white/80 hover:text-white transition"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                Back to Overview
            </Link>
        </div>
    );
}
