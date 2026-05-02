import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./rag-db";
import type { Doc } from "./rag-db";

const SYSTEM = `You extract structured user preferences from Claude configuration files.

Given a markdown document containing a user's Claude rules/preferences, extract key-value pairs organized by category.

Return ONLY a valid JSON array — no markdown, no explanation:
[
  { "category": "stack", "key": "framework", "value": "Next.js 16 App Router" },
  { "category": "stack", "key": "css", "value": "Tailwind only, no CSS modules" },
  ...
]

Categories to use:
- stack: programming languages, frameworks, tools, databases
- style: code style preferences, formatting, naming conventions
- workflow: how they like to work, commit rules, deployment
- feedback: things they've corrected, "never do this" patterns
- infra: infrastructure, hosting, CI/CD, servers
- security: security rules, auth patterns
- ui: UI/UX preferences, design patterns

Rules:
- Be specific and actionable (not "uses databases" but "PostgreSQL via Supabase")
- Extract 5-20 preferences per document
- Skip generic/obvious things
- Include the "why" when stated`;

export async function extractPreferences(): Promise<number> {
  const db = getDb();
  const anthropic = new Anthropic();

  // Get key docs: global rules + project CLAUDE.md files + feedback memories
  const docs = db.prepare(`
    SELECT * FROM documents
    WHERE source_type IN ('global_rules', 'claude_md')
    OR (source_type = 'memory' AND title LIKE '%feedback%')
    OR (source_type = 'memory' AND title LIKE '%preference%')
    OR (source_type = 'memory' AND title LIKE '%user%')
    ORDER BY source_type, project
  `).all() as Doc[];

  if (docs.length === 0) return 0;

  // Batch docs into one prompt (they're small)
  const combined = docs.map(d =>
    `--- ${d.title} (${d.project || "global"}, ${d.source_type}) ---\n${d.content.slice(0, 2000)}`
  ).join("\n\n");

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: combined }],
  });

  const text = msg.content.find(b => b.type === "text")?.text ?? "[]";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return 0;

  const prefs: { category: string; key: string; value: string }[] = JSON.parse(match[0]);

  // Upsert preferences
  const upsert = db.prepare(`
    INSERT INTO preferences (category, key, value, confidence)
    VALUES (?, ?, ?, 1.0)
    ON CONFLICT(category, key) DO UPDATE SET value = excluded.value, confidence = excluded.confidence
  `);

  const tx = db.transaction(() => {
    for (const p of prefs) {
      upsert.run(p.category, p.key, p.value);
    }
  });

  tx();
  return prefs.length;
}
