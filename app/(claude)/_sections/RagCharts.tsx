"use client";

import { useState, useEffect } from "react";
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    BarChart, Bar,
} from "recharts";
import { cardShell } from "@/lib/ui-tokens";

const COLORS = ["#22c55e", "#10b981", "#eab308", "#8b5cf6", "#a855f7", "#06b6d4", "#3b82f6", "#f59e0b", "#ef4444", "#ec4899"];

type Props = {
    typeCounts: { source_type: string; count: number }[];
    projectCounts: { project: string; count: number }[];
    prefCategories: { category: string; count: number }[];
    timeline: { day: string; count: number; conversations: number; insights: number; memory: number }[];
    injectionTimeline: { day: string; count: number; avg_size: number }[];
};

export default function RagCharts({ typeCounts, projectCounts, prefCategories, timeline, injectionTimeline }: Props) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;

    const typeData = typeCounts.map((t, i) => ({ name: t.source_type, value: t.count, fill: COLORS[i % COLORS.length] }));
    const radarData = prefCategories.map(p => ({ category: p.category, count: p.count, fullMark: Math.max(...prefCategories.map(x => x.count)) }));
    const projectData = projectCounts.slice(0, 8).map((p, i) => ({ name: p.project, docs: p.count, fill: COLORS[i % COLORS.length] }));

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            {/* Donut - Document Types */}
            <div style={cardShell}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Document Types</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>Breakdown by source type</div>
                <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                        <Pie data={typeData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value" strokeWidth={0}>
                            {typeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "#1a1b23", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} itemStyle={{ color: "#fff" }} />
                    </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 4 }}>
                    {typeData.map((d, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ width: 6, height: 6, borderRadius: 3, background: d.fill }} />
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{d.name}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, color: d.fill }}>{d.value}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Radar - Preference Categories */}
            <div style={cardShell}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Preference Coverage</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>Knowledge depth by category</div>
                <ResponsiveContainer width="100%" height={180}>
                    <RadarChart data={radarData}>
                        <PolarGrid stroke="rgba(255,255,255,0.08)" />
                        <PolarAngleAxis dataKey="category" tick={{ fill: "rgba(255,255,255,0.52)", fontSize: 8 }} />
                        <PolarRadiusAxis tick={false} axisLine={false} />
                        <Radar dataKey="count" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={2} dot={{ fill: "#10b981", r: 3 }} />
                    </RadarChart>
                </ResponsiveContainer>
            </div>

            {/* Area Chart - Ingestion Timeline */}
            <div style={cardShell}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Ingestion Over Time</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>Documents added per day</div>
                <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={timeline}>
                        <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 8 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 8 }} width={30} />
                        <Tooltip contentStyle={{ background: "#1a1b23", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} itemStyle={{ color: "#fff" }} />
                        <Area type="monotone" dataKey="conversations" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
                        <Area type="monotone" dataKey="insights" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                        <Area type="monotone" dataKey="memory" stackId="1" stroke="#eab308" fill="#eab308" fillOpacity={0.3} />
                    </AreaChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 4 }}>
                    {[{ label: "Conversations", color: "#22c55e" }, { label: "Insights", color: "#10b981" }, { label: "Memory", color: "#eab308" }].map(l => (
                        <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ width: 8, height: 3, borderRadius: 1, background: l.color }} />
                            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>{l.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bar Chart - Top Projects */}
            <div style={cardShell}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Top Projects</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>Documents per project</div>
                <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={projectData} layout="vertical">
                        <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 8 }} />
                        <YAxis dataKey="name" type="category" tick={{ fill: "rgba(255,255,255,0.52)", fontSize: 9 }} width={65} />
                        <Tooltip contentStyle={{ background: "#1a1b23", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} itemStyle={{ color: "#fff" }} />
                        <Bar dataKey="docs" radius={[0, 4, 4, 0]}>
                            {projectData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.7} />)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
