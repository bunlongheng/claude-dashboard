import fs from "fs";
import path from "path";
import crypto from "crypto";
import { glob } from "glob";
import { getDb, syncFts } from "./rag-db";

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function extractProject(filePath: string): string {
  const user = require("os").userInfo().username;
  const match = filePath.match(new RegExp(`-Users-${user}-Sites-([^/]+)/`));
  if (match) return match[1];
  const match2 = filePath.match(new RegExp(`-Users-${user}-([^/]+)/`));
  if (match2) return match2[1];
  return "global";
}

type UserMessage = {
  text: string;
  timestamp?: string;
};

function parseSessionMessages(filePath: string): UserMessage[] {
  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  const messages: UserMessage[] = [];

  for (const line of lines) {
    try {
      const d = JSON.parse(line);
      if (d.type !== "user") continue;

      const content = d.message?.content;
      let text = "";

      if (typeof content === "string") {
        text = content;
      } else if (Array.isArray(content)) {
        text = content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("\n");
      }

      // Skip very short or system messages
      text = text.trim();
      if (text.length < 15) continue;
      // Skip terminal output pastes
      if (text.match(/^\w+@\w+/) || text.startsWith("zsh:")) continue;

      messages.push({ text, timestamp: d.timestamp });
    } catch {
      // Skip malformed lines
    }
  }

  return messages;
}

export async function ingestSessions(): Promise<{ total: number; created: number; skipped: number; chunks: number }> {
  const db = getDb();
  const home = require("os").homedir();
  const files = await glob(path.join(home, ".claude/projects/*/*.jsonl"));

  let created = 0, skipped = 0, totalChunks = 0;

  for (const filePath of files) {
    const stat = fs.statSync(filePath);
    const hash = sha256(`${filePath}:${stat.size}:${stat.mtimeMs}`);

    // Check if already ingested with same hash (size+mtime based)
    const existing = db.prepare("SELECT id, content_hash FROM documents WHERE source_path = ?").get(filePath) as { id: number; content_hash: string } | undefined;

    if (existing && existing.content_hash === hash) {
      skipped++;
      continue;
    }

    const messages = parseSessionMessages(filePath);
    if (messages.length === 0) {
      skipped++;
      continue;
    }

    const project = extractProject(filePath);
    const sessionId = path.basename(filePath, ".jsonl").slice(0, 8);
    const title = `Session ${sessionId} (${project})`;

    // Combine all user messages into one document
    const content = messages.map(m => m.text).join("\n\n---\n\n");

    // Chunk by individual messages (group small ones)
    const chunks: string[] = [];
    let buf = "";
    for (const m of messages) {
      if (buf.length + m.text.length > 1200 && buf.length > 50) {
        chunks.push(buf.trim());
        buf = m.text;
      } else {
        buf += (buf ? "\n\n" : "") + m.text;
      }
    }
    if (buf.trim().length > 50) chunks.push(buf.trim());

    const upsert = db.transaction(() => {
      let docId: number;

      if (existing) {
        db.prepare("UPDATE documents SET content = ?, content_hash = ?, title = ?, updated_at = datetime('now') WHERE id = ?")
          .run(content, hash, title, existing.id);
        db.prepare("DELETE FROM chunks WHERE doc_id = ?").run(existing.id);
        docId = existing.id;
      } else {
        const result = db.prepare("INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)")
          .run(filePath, "conversation", project, title, content, hash);
        docId = result.lastInsertRowid as number;
      }

      for (let i = 0; i < chunks.length; i++) {
        db.prepare("INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)")
          .run(docId, i, chunks[i], Math.ceil(chunks[i].length / 4));
      }
    });

    upsert();
    created++;
    totalChunks += chunks.length;
  }

  // Rebuild FTS
  syncFts(db);

  return { total: files.length, created, skipped, chunks: totalChunks };
}
