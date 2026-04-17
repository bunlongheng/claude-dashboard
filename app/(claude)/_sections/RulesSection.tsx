"use client";

import { useState, useMemo, useEffect } from "react";
import {
    CpuChipIcon, XMarkIcon, PlusIcon, PencilIcon, TrashIcon, CheckIcon,
} from "@heroicons/react/24/outline";
import { List, Orbit } from "lucide-react";
import dynamic from "next/dynamic";
import { CATEGORY_COLORS, timeAgo, GlobalInstruction } from "./shared";

const BrainSolar = dynamic(() => import("./BrainSolar"), { ssr: false });

const CATEGORY_COLORS_MODAL: Record<string, string> = {
    security: "#ef4444", architecture: "#ff3333", workflow: "#0ea5e9",
    performance: "#ffdd00", css: "#ff8800", db: "#cc6633", infra: "#9333ea", general: "#6b7280",
};

function RuleModal({ rule, onClose }: { rule: GlobalInstruction; onClose: () => void }) {
    const color = CATEGORY_COLORS_MODAL[rule.category] ?? "#6b7280";
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-lg bg-[#0f1117] border border-white/[0.1] rounded-2xl border-t-2 overflow-hidden" style={{ borderTopColor: color }} onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full" style={{ background: `${color}22`, border: `1px solid ${color}60`, color }}>{rule.category}</span>
                        <h2 className="text-sm font-bold text-white/90 mt-2 leading-snug">{rule.title}</h2>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition flex items-center justify-center shrink-0">
                        <XMarkIcon className="w-3 h-3" />
                    </button>
                </div>
                <div className="px-6 pb-6">
                    <p className="text-[12px] text-white/60 leading-relaxed whitespace-pre-wrap">{rule.instruction}</p>
                    <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.06]">
                        <span className="text-[9px] text-white/25 font-mono">{new Date(rule.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}</span>
                        {rule.last_used_at && (
                            <span className="inline-flex items-center gap-1 text-[9px] text-white/35">
                                <CpuChipIcon className="w-2 h-2" /> {(() => { const s = Math.floor((Date.now() - new Date(rule.last_used_at).getTime()) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s/60)}m ago` : s < 86400 ? `${Math.floor(s/3600)}h ago` : `${Math.floor(s/86400)}d ago`; })()}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function AddRuleModal({ onClose, onAdd }: {
    onClose: () => void;
    onAdd: (rule: GlobalInstruction) => void;
}) {
    const [newForm, setNewForm] = useState({ category: "general", title: "", instruction: "" });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const handleAdd = async () => {
        if (!newForm.title.trim() || !newForm.instruction.trim()) return;
        setSaving(true);
        try {
            const res = await fetch("/api/claude/global", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...newForm, source: "manual" }),
            });
            if (res.ok) {
                const { rule } = await res.json();
                onAdd(rule);
                onClose();
            }
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}>
            <div className="w-full max-w-lg bg-[#0f1117] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                        <PlusIcon className="w-3.5 h-3.5 text-[#f97316]" />
                        <span className="text-[13px] font-bold text-white">New Rule</span>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white/50 hover:text-white transition">
                        <XMarkIcon className="w-3 h-3" />
                    </button>
                </div>
                <div className="px-5 py-4 space-y-4">
                    <div>
                        <p className="text-[9px] font-black tracking-widest text-white/30 uppercase mb-2">Category</p>
                        <div className="flex flex-wrap gap-1.5">
                            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => {
                                const active = newForm.category === cat;
                                return (
                                    <button key={cat} onClick={() => setNewForm(f => ({ ...f, category: cat }))}
                                        className="px-2.5 py-1 rounded-full text-[10px] font-bold transition-all uppercase"
                                        style={{
                                            background: active ? `${color}30` : `${color}10`,
                                            border: `1px solid ${active ? color + "80" : color + "30"}`,
                                            color: active ? color : `${color}70`,
                                        }}>
                                        {cat}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <p className="text-[9px] font-black tracking-widest text-white/30 uppercase mb-1.5">Title</p>
                        <input
                            autoFocus
                            value={newForm.title}
                            onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="Rule title…"
                            className="w-full text-[12px] font-bold bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/90 placeholder:text-white/20 outline-none focus:border-[#f97316]/40 transition" />
                    </div>
                    <div>
                        <p className="text-[9px] font-black tracking-widest text-white/30 uppercase mb-1.5">Instruction</p>
                        <textarea
                            value={newForm.instruction}
                            onChange={e => setNewForm(f => ({ ...f, instruction: e.target.value }))}
                            rows={4}
                            placeholder="Instruction text…"
                            className="w-full text-[11px] bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/70 placeholder:text-white/20 resize-none outline-none focus:border-[#f97316]/40 transition" />
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.06] bg-black/20">
                    <button onClick={onClose} className="text-[11px] text-white/30 hover:text-white/60 px-3 py-1.5 transition">Cancel</button>
                    <button onClick={handleAdd} disabled={saving || !newForm.title.trim() || !newForm.instruction.trim()}
                        className="flex items-center gap-1.5 text-[11px] font-bold px-4 py-1.5 rounded-lg bg-[#f97316]/15 border border-[#f97316]/30 text-[#f97316] hover:bg-[#f97316]/25 transition disabled:opacity-40">
                        <CheckIcon className="w-3 h-3" />{saving ? "Adding…" : "Add Rule"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function RulesSection({ initialInstructions }: { initialInstructions: GlobalInstruction[] }) {
    const [view, setView] = useState<"list" | "solar">("list");
    const [instructions, setInstructions] = useState<GlobalInstruction[]>(initialInstructions);
    const [editingId, setEditingId]   = useState<string | null>(null);
    const [editForm, setEditForm]     = useState({ category: "general", title: "", instruction: "" });
    const [addingNew, setAddingNew]   = useState(false);
    const [saving, setSaving]         = useState(false);
    const [selectedRule, setSelectedRule] = useState<GlobalInstruction | null>(null);
    const [catFilter, setCatFilter]   = useState<string>("all");
    const [globalPage, setGlobalPage] = useState(0);
    const PAGE_SIZE = 5;

    const setCatFilterAndReset = (cat: string) => { setCatFilter(cat); setGlobalPage(0); };

    const handleEditStart = (inst: GlobalInstruction) => {
        setEditingId(inst.id);
        setEditForm({ category: inst.category, title: inst.title, instruction: inst.instruction });
    };

    const handleEditSave = async () => {
        if (!editingId) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/claude/global/${editingId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm),
            });
            if (res.ok) {
                const { rule } = await res.json();
                setInstructions(prev => prev.map(i => i.id === editingId ? rule : i));
                setEditingId(null);
            }
        } finally { setSaving(false); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this rule?")) return;
        const res = await fetch(`/api/claude/global/${id}`, { method: "DELETE" });
        if (res.ok) setInstructions(prev => prev.filter(i => i.id !== id));
    };

    const [projectFilter, setProjectFilter] = useState<string>("all");

    const allProjects = useMemo(() => {
        const projects = new Set(instructions.map(i => i.project || "global"));
        return Array.from(projects).sort();
    }, [instructions]);

    const filteredInstructions = useMemo(() => {
        let base = instructions;
        if (projectFilter !== "all") base = base.filter(i => (i.project || "global") === projectFilter);
        if (catFilter !== "all") base = base.filter(i => i.category === catFilter);
        return [...base].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [instructions, catFilter, projectFilter]);
    const visibleInstructions = useMemo(() =>
        filteredInstructions.slice(globalPage * PAGE_SIZE, (globalPage + 1) * PAGE_SIZE),
        [filteredInstructions, globalPage]
    );
    const totalGlobalPages = Math.ceil(filteredInstructions.length / PAGE_SIZE);
    const allCats = useMemo(() => Array.from(new Set(instructions.map(i => i.category))).sort(), [instructions]);

    if (view === "solar") {
        return (
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => setView("list")}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                        <List size={10} /> List
                    </button>
                    <button
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition"
                        style={{ background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.4)", color: "#a855f7" }}>
                        <Orbit size={10} /> Solar
                    </button>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>{instructions.length} rules</span>
                </div>
                {process.env.NEXT_PUBLIC_MODE === "admin" && <BrainSolar />}
            </div>
        );
    }

    return (
        <>
            {selectedRule && <RuleModal rule={selectedRule} onClose={() => setSelectedRule(null)} />}
            {addingNew && <AddRuleModal onClose={() => setAddingNew(false)} onAdd={rule => setInstructions(prev => [rule, ...prev])} />}

            {/* View toggle */}
            <div className="flex items-center gap-2 mb-3">
                <button
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition"
                    style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff" }}>
                    <List size={10} /> List
                </button>
                <button onClick={() => setView("solar")}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                    <Orbit size={10} /> Solar
                </button>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>{instructions.length} rules</span>
            </div>

            {/* Project filter pills */}
            {allProjects.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    <button type="button" onClick={() => { setProjectFilter("all"); setGlobalPage(0); }}
                        className="px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors"
                        style={{ background: projectFilter === "all" ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.04)", border: projectFilter === "all" ? "1px solid rgba(249,115,22,0.4)" : "1px solid rgba(255,255,255,0.08)", color: projectFilter === "all" ? "#f97316" : "rgba(255,255,255,0.35)" }}>
                        All Apps - {instructions.length}
                    </button>
                    {allProjects.map(p => {
                        const cnt = instructions.filter(i => (i.project || "global") === p).length;
                        return (
                            <button key={p} type="button" onClick={() => { setProjectFilter(p); setGlobalPage(0); }}
                                className="px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors"
                                style={{
                                    background: projectFilter === p ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                                    border: projectFilter === p ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,255,255,0.08)",
                                    color: projectFilter === p ? "#22c55e" : "rgba(255,255,255,0.35)",
                                }}>
                                {p} - {cnt}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Category filter pills */}
            <div className="flex flex-wrap gap-1.5 mb-4">
                <button type="button" onClick={() => setCatFilterAndReset("all")}
                    className="px-2 sm:px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors uppercase"
                    style={{ background: catFilter === "all" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: catFilter === "all" ? "#fff" : "rgba(255,255,255,0.35)" }}>
                    <span className="sm:hidden">*</span>
                    <span className="hidden sm:inline">ALL · {instructions.length}</span>
                </button>
                {allCats.map(cat => {
                    const color = CATEGORY_COLORS[cat] ?? "#6b7280";
                    const cnt   = instructions.filter(i => i.category === cat).length;
                    return (
                        <button key={cat} type="button" onClick={() => setCatFilterAndReset(cat)}
                            className="px-2 sm:px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors uppercase"
                            style={{
                                background: catFilter === cat ? `${color}22` : `${color}0f`,
                                border: `1px solid ${catFilter === cat ? color + "60" : color + "35"}`,
                                color: catFilter === cat ? color : `${color}99`,
                            }}>
                            <span className="sm:hidden">{cat[0].toUpperCase()}</span>
                            <span className="hidden sm:inline">{cat.toUpperCase()} · {cnt}</span>
                        </button>
                    );
                })}
            </div>

            {/* Instructions table */}
            <div className="bg-[#0f1117] border border-white/[0.08] rounded-xl overflow-hidden">
                {/* Table header */}
                <div className="flex items-center gap-2 border-b border-white/[0.06] bg-black/20 px-5 py-3">
                    <span className="text-[9px] font-black tracking-widest text-white/30 uppercase w-6 shrink-0">#</span>
                    <span className="text-[9px] font-black tracking-widest text-white/30 uppercase w-[90px] shrink-0 hidden sm:block">Category</span>
                    <span className="text-[9px] font-black tracking-widest text-white/30 uppercase flex-1">Rule</span>
                    {totalGlobalPages > 1 && (
                        <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => setGlobalPage(p => Math.max(0, p - 1))} disabled={globalPage === 0}
                                className="px-2 py-0.5 rounded text-[9px] font-bold border border-white/[0.08] text-white/35 hover:text-white/70 hover:border-white/20 disabled:opacity-25 disabled:cursor-not-allowed transition">←</button>
                            <span className="text-[9px] text-white/30 tabular-nums">{globalPage + 1}/{totalGlobalPages}</span>
                            <button onClick={() => setGlobalPage(p => Math.min(totalGlobalPages - 1, p + 1))} disabled={globalPage >= totalGlobalPages - 1}
                                className="px-2 py-0.5 rounded text-[9px] font-bold border border-white/[0.08] text-white/35 hover:text-white/70 hover:border-white/20 disabled:opacity-25 disabled:cursor-not-allowed transition">→</button>
                        </div>
                    )}
                    <button onClick={() => { setAddingNew(true); setEditingId(null); }}
                        className="flex items-center gap-1 text-[9px] font-bold text-white/30 hover:text-[#f97316] transition shrink-0">
                        <PlusIcon className="w-2.5 h-2.5" /> Add
                    </button>
                </div>
                {/* Rows */}
                <div className="divide-y divide-white/[0.04]">
                    {filteredInstructions.length === 0 && (
                        <p className="text-white/30 text-xs text-center py-10">No instructions yet.</p>
                    )}
                    {visibleInstructions.map(inst => {
                        const color = CATEGORY_COLORS[inst.category] ?? "#6b7280";
                        if (editingId === inst.id) return (
                            <div key={inst.id} className="px-5 py-4 bg-white/[0.02] border-l-4" style={{ borderColor: color }}>
                                <div className="flex gap-2 mb-2">
                                    <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                                        className="text-[10px] bg-black/60 border border-white/15 rounded px-2 py-1 text-white/80 outline-none">
                                        {Object.keys(CATEGORY_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                                        className="flex-1 text-[11px] font-bold bg-black/60 border border-white/15 rounded px-2 py-1 text-white/90 outline-none" />
                                </div>
                                <textarea value={editForm.instruction} onChange={e => setEditForm(f => ({ ...f, instruction: e.target.value }))}
                                    rows={3}
                                    className="w-full text-[10px] bg-black/60 border border-white/15 rounded px-2 py-1.5 text-white/70 resize-none outline-none mb-2" />
                                <div className="flex gap-2">
                                    <button onClick={handleEditSave} disabled={saving}
                                        className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition disabled:opacity-40">
                                        <CheckIcon className="w-2.5 h-2.5" />{saving ? "Saving…" : "Save"}
                                    </button>
                                    <button onClick={() => setEditingId(null)} className="text-[10px] text-white/30 hover:text-white/60 px-2 transition">Cancel</button>
                                </div>
                            </div>
                        );
                        return (
                            <div key={inst.id} className="group flex items-start gap-3 px-5 py-4 hover:bg-white/[0.025] transition-colors cursor-pointer" onClick={() => setSelectedRule(inst)}>
                                <button
                                    onClick={e => { e.stopPropagation(); try { navigator.clipboard.writeText(inst.id); } catch { const el = document.createElement("textarea"); el.value = inst.id; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el); } }}
                                    className="w-6 shrink-0 text-[9px] font-mono text-white/20 hover:text-white/60 text-left mt-0.5 transition-colors"
                                    title={inst.id}
                                >
                                    {globalPage * PAGE_SIZE + visibleInstructions.indexOf(inst) + 1}
                                </button>
                                <span className="hidden sm:inline-flex mt-0.5 w-[90px] shrink-0">
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase truncate"
                                        style={{ background: `${color}22`, border: `1px solid ${color}60`, color }}>
                                        {inst.category}
                                    </span>
                                </span>
                                <div className="flex-1 min-w-0">
                                    <span className="sm:hidden inline-flex mb-1">
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                                            style={{ background: `${color}22`, border: `1px solid ${color}60`, color }}>
                                            {inst.category}
                                        </span>
                                    </span>
                                    <p className="text-[11px] font-bold text-white/90 leading-snug">{inst.title}</p>
                                    <p className="text-[10px] text-white/40 leading-snug mt-0.5 line-clamp-1">{inst.instruction}</p>
                                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                                        <span className="text-[9px] text-white/20">{timeAgo(new Date(inst.created_at).getTime())}</span>
                                        {inst.last_used_at && (
                                            <span className="inline-flex items-center gap-1 text-[9px] text-white/20">
                                                <CpuChipIcon className="w-2 h-2" />
                                                {timeAgo(new Date(inst.last_used_at).getTime())}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0">
                                    <button onClick={e => { e.stopPropagation(); handleEditStart(inst); }}
                                        className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition">
                                        <PencilIcon className="w-3 h-3" />
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); handleDelete(inst.id); }}
                                        className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 transition">
                                        <TrashIcon className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
