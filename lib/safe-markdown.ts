import { marked, type MarkedOptions } from "marked";
import DOMPurify from "dompurify";

/**
 * marked v17 passes raw HTML through untouched, so every dangerouslySetInnerHTML
 * site that renders markdown (session transcripts, CLAUDE.md, SKILL.md) goes
 * through here. The html profile drops svg/math along with scripts, event
 * handlers and javascript: URLs; class/style survive so Prism highlighting keeps
 * working. Client-only: DOMPurify has no DOM on the server and would return the
 * input as-is, so SSR renders nothing and the client fills it in.
 */
export function safeMarkdown(md: string, options?: MarkedOptions): string {
    if (typeof window === "undefined") return "";
    const html = marked.parse(md, { ...options, async: false }) as string;
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
