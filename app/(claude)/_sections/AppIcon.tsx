"use client";

import { useMemo, useState } from "react";

/**
 * Reusable app icon component. Uses static icons from /app-icons/ (synced at build time).
 * Tries multiple slug variants (full path slug + trailing basenames) so projects keyed by
 * folder names like "-Users-you-Sites-claude" still hit the curated "claude.png" file.
 * Order: curated /app-icons -> the project-icon API (real favicons; 404s when none) ->
 * the default Claude Code logo. So a project with a real icon shows it, and only a truly
 * icon-less session (e.g. dad-usb) falls back to the Claude Code logo.
 */
const DEFAULT_ICON = "/app-icons/claude-code.png";
export default function AppIcon({ project, size = 16 }: { project: string; size?: number }) {
    const slug = (project || "").toLowerCase().replace(/[\s_]+/g, "-");

    // Build the candidate list: full slug, then progressively shorter trailing basenames
    // (`local-apps`, `apps`, etc.), both .png and .svg. API fallback last.
    const candidates = useMemo(() => {
        if (!project) return [] as string[];
        const parts = slug.split("-").filter(Boolean);
        const basenames: string[] = [slug];
        for (let take = Math.min(parts.length, 3); take >= 1; take--) {
            basenames.push(parts.slice(-take).join("-"));
        }
        const seen = new Set<string>();
        const out: string[] = [];
        const add = (u: string) => { if (!seen.has(u)) { seen.add(u); out.push(u); } };
        for (const ext of ["png", "svg"]) for (const b of basenames) add(`/app-icons/${b}.${ext}`);
        // Real favicon from the project-icon API - it returns a proper icon when the
        // project has one (e.g. worldcup26 -> FIFA) and 404s cleanly when it does not.
        add(`/api/claude/project-icon?project=${encodeURIComponent(project)}`);
        // Only when nothing is found anywhere: the Claude Code logo (never a random guess).
        add(DEFAULT_ICON);
        return out;
    }, [project, slug]);

    const [idx, setIdx] = useState(0);
    const [failed, setFailed] = useState(false);

    if (!project || failed || idx >= candidates.length) {
        return (
            <span style={{
                width: size, height: size, borderRadius: Math.round(size / 4),
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: Math.round(size * 0.5), fontWeight: 700, color: "rgba(255,255,255,0.45)",
                flexShrink: 0,
            }}>?</span>
        );
    }

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={candidates[idx]}
            alt={project}
            width={size}
            height={size}
            onError={() => {
                if (idx < candidates.length - 1) setIdx(idx + 1);
                else setFailed(true);
            }}
            style={{ borderRadius: Math.round(size / 4), objectFit: "contain", flexShrink: 0, imageRendering: "-webkit-optimize-contrast" }}
        />
    );
}
