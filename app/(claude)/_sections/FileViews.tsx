"use client";

import { useState } from "react";
import { LayoutGrid, CircleDot, List as ListIcon, ChevronRight, FileText } from "lucide-react";
import { useDialog } from "./shared";

export type ViewMode = "list" | "thumbs" | "circles";

export type FileItem = {
    id: string;
    name: string;
    description?: string;
    path?: string;
    content?: string;
    badge?: string;
};

// Shared 3-mode switcher (List / Thumb / Circle). Drop next to a section's
// filter/search controls and feed it the section's `mode` state.
export function ViewModeToggle({ mode, onMode }: { mode: ViewMode; onMode: (m: ViewMode) => void }) {
    const modes: [ViewMode, React.ElementType, string][] = [
        ["list", ListIcon, "List"],
        ["thumbs", LayoutGrid, "Thumbnails"],
        ["circles", CircleDot, "Circles"],
    ];
    return (
        <div className="flex gap-1 ml-auto">
            {modes.map(([m, Icon, title]) => (
                <button key={m} type="button" onClick={() => onMode(m)} title={title} aria-label={title} aria-pressed={mode === m}
                    className="p-1.5 rounded-md cursor-pointer transition"
                    style={{
                        background: mode === m ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                        border: mode === m ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.06)",
                        color: mode === m ? "#fff" : "rgba(255,255,255,0.3)",
                    }}>
                    <Icon size={14} />
                </button>
            ))}
        </div>
    );
}

function pathLabel(p?: string) {
    return p ? p.replace(/.*\.claude\//, "~/.claude/") : "";
}

// List: full-width rows. By default click expands inline. If the caller passes
// `onItemClick`, that takes over (e.g. SkillsSection opens its own modal with
// edit/sync controls, which is richer than an inline pre).
function ListView({ items, accent, getIcon, onItemClick }: { items: FileItem[]; accent: string; getIcon: (i: FileItem) => React.ElementType; onItemClick?: (item: FileItem) => void }) {
    const [open, setOpen] = useState<string | null>(null);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((item) => {
                const Icon = getIcon(item);
                const isOpen = !onItemClick && open === item.id;
                return (
                    <div key={item.id} style={{
                        borderRadius: 10, border: `1px solid ${isOpen ? `${accent}40` : "rgba(255,255,255,0.07)"}`,
                        background: isOpen ? `${accent}0c` : "rgba(255,255,255,0.02)", transition: "border-color 0.2s, background 0.2s",
                    }}>
                        <button onClick={() => onItemClick ? onItemClick(item) : setOpen(isOpen ? null : item.id)}
                            className="w-full cursor-pointer hover:bg-white/[0.03] transition"
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "none", border: "none", textAlign: "left" }}>
                            <ChevronRight size={13} style={{ color: "rgba(255,255,255,0.55)", flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
                            <Icon size={15} style={{ color: accent, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>{item.name}</span>
                            {item.badge && <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", padding: "1px 6px", borderRadius: 5, background: `${accent}1f`, color: accent, flexShrink: 0 }}>{item.badge}</span>}
                            {item.description && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</span>}
                        </button>
                        {isOpen && (
                            <div style={{ padding: "0 12px 12px 35px" }}>
                                {item.path && <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", margin: "0 0 6px", fontFamily: "monospace" }}>{pathLabel(item.path)}</p>}
                                <pre style={{
                                    margin: 0, padding: "10px 12px", borderRadius: 8, maxHeight: 380, overflow: "auto",
                                    background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.06)",
                                    fontSize: 11, lineHeight: 1.55, color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap", wordBreak: "break-word",
                                }}>{item.content?.trim() || "(empty)"}</pre>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// Thumb: responsive grid of cards.
function ThumbView({ items, accent, getIcon }: { items: FileItem[]; accent: string; getIcon: (i: FileItem) => React.ElementType }) {
    const [open, setOpen] = useState<string | null>(null);
    const active = items.find((i) => i.id === open);
    return (
        <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                {items.map((item) => {
                    const Icon = getIcon(item);
                    return (
                        <button key={item.id} onClick={() => setOpen(item.id)}
                            className="cursor-pointer group"
                            style={{
                                display: "flex", flexDirection: "column", gap: 8, padding: "14px 12px", borderRadius: 14, textAlign: "left",
                                background: `linear-gradient(135deg, ${accent}12 0%, rgba(255,255,255,0.02) 100%)`,
                                border: `1px solid ${accent}22`, transition: "transform 0.15s, border-color 0.15s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = `${accent}55`; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = `${accent}22`; }}>
                            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${accent}1f`, border: `1px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Icon size={18} style={{ color: accent }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                            {item.description && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.description}</span>}
                        </button>
                    );
                })}
            </div>
            {active && <FilePeek item={active} accent={accent} onClose={() => setOpen(null)} />}
        </>
    );
}

// Circle: compact grid of round icon bubbles with the name beneath.
function CircleView({ items, accent, getIcon }: { items: FileItem[]; accent: string; getIcon: (i: FileItem) => React.ElementType }) {
    const [open, setOpen] = useState<string | null>(null);
    const active = items.find((i) => i.id === open);
    return (
        <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))", gap: 14, justifyItems: "center" }}>
                {items.map((item) => {
                    const Icon = getIcon(item);
                    return (
                        <button key={item.id} onClick={() => setOpen(item.id)} title={item.description || item.name}
                            className="cursor-pointer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "none", width: "100%" }}>
                            <span style={{
                                width: 52, height: 52, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                                background: `radial-gradient(circle at 30% 25%, ${accent}33, ${accent}14)`, border: `1px solid ${accent}3a`,
                                transition: "transform 0.15s, box-shadow 0.15s",
                            }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = `0 4px 16px ${accent}33`; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
                                <Icon size={22} style={{ color: accent }} />
                            </span>
                            <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.55)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{item.name}</span>
                        </button>
                    );
                })}
            </div>
            {active && <FilePeek item={active} accent={accent} onClose={() => setOpen(null)} />}
        </>
    );
}

// Shared modal used by Thumb/Circle to read a file without leaving the view.
function FilePeek({ item, accent, onClose }: { item: FileItem; accent: string; onClose: () => void }) {
    const dialog = useDialog(onClose, "file-peek-title");
    return (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div {...dialog} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, maxHeight: "80vh", display: "flex", flexDirection: "column", background: "#0e1017", border: `1px solid ${accent}33`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <span id="file-peek-title" style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{item.name}</span>
                    {item.path && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", fontFamily: "monospace", marginLeft: "auto" }}>{pathLabel(item.path)}</span>}
                </div>
                <pre style={{ margin: 0, padding: 16, overflow: "auto", fontSize: 11, lineHeight: 1.55, color: "rgba(255,255,255,0.72)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.content?.trim() || "(empty)"}</pre>
            </div>
        </div>
    );
}

export function FileViews({ items, mode, accent = "#f97316", getIcon, onItemClick }: {
    items: FileItem[]; mode: ViewMode; accent?: string; getIcon?: (i: FileItem) => React.ElementType;
    // When supplied, list-row clicks call this instead of using the internal inline expand.
    onItemClick?: (item: FileItem) => void;
}) {
    const resolveIcon = getIcon ?? (() => FileText);
    if (items.length === 0) return <p className="text-white/30 text-center py-12 text-sm">Nothing here yet.</p>;
    if (mode === "thumbs") return <ThumbView items={items} accent={accent} getIcon={resolveIcon} />;
    if (mode === "circles") return <CircleView items={items} accent={accent} getIcon={resolveIcon} />;
    return <ListView items={items} accent={accent} getIcon={resolveIcon} onItemClick={onItemClick} />;
}
