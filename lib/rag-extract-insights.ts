import Anthropic from "@anthropic-ai/sdk";
import { getDb, syncFts } from "./rag-db";
import type { Doc } from "./rag-db";

const SYSTEM = `You analyze Claude Code conversation sessions and extract notable insights.

Given a session transcript (user messages only), extract what's worth remembering:
- What was built or changed
- Architecture decisions made
- Technologies/tools/patterns used
- Problems encountered and how they were solved
- User preferences revealed (how they like things done)
- Anything the user corrected or pushed back on

Return ONLY a valid JSON object:
{
  "title": "<what this session was about, 5-10 words>",
  "summary": "<2-3 sentence summary of what happened>",
  "insights": [
    "Built X using Y",
    "Decided to use Z instead of W because...",
    "User prefers..."
  ]
}

Rules:
- Always find SOMETHING notable — even a 1-message session reveals what the user was thinking about
- Be specific (not "worked on app" but "added OAuth login with Auth0 PKCE flow")
- Max 8 insights per session
- If the session is very short, note what the user was exploring/asking about`;

export async function extractSessionInsights(limit = 50): Promise<number> {
  const db = getDb();
  const anthropic = new Anthropic();

  // Find conversation docs that don't have a corresponding insight doc yet
  const sessions = db.prepare(`
    SELECT d.* FROM documents d
    WHERE d.source_type = 'conversation'
    AND NOT EXISTS (
      SELECT 1 FROM documents d2
      WHERE d2.source_type = 'insight'
      AND d2.title = 'Insight: ' || d.title
    )
    ORDER BY d.updated_at DESC
    LIMIT ?
  `).all(limit) as Doc[];

  if (sessions.length === 0) return 0;

  let created = 0;

  for (const session of sessions) {
    // Skip very tiny sessions
    if (session.content.length < 30) continue;

    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: "user", content: session.content.slice(0, 4000) }],
      });

      const text = msg.content.find(b => b.type === "text")?.text ?? "{}";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;

      const parsed = JSON.parse(match[0]);
      if (!parsed.title || !parsed.insights?.length) continue;

      // Create an insight document
      const content = `# ${parsed.title}\n\n${parsed.summary}\n\n## Key Insights\n${parsed.insights.map((i: string) => `- ${i}`).join("\n")}`;
      const hash = `insight-${session.id}-${Date.now()}`;

      const result = db.prepare(
        "INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(`insight:${session.id}`, "insight", session.project, `Insight: ${session.title}`, content, hash);

      const docId = result.lastInsertRowid as number;

      // Chunk the insight (usually small enough for 1 chunk)
      db.prepare("INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)")
        .run(docId, 0, content, Math.ceil(content.length / 4));

      created++;
    } catch (e) {
      console.error(`Failed to extract insights from ${session.title}:`, e);
    }
  }

  if (created > 0) syncFts(db);
  return created;
}
