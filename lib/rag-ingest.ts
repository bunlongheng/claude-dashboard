import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getDb, syncFts } from "./rag-db";
import { glob } from "glob";
import { extractPreferences } from "./rag-extract-preferences";

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function extractTitle(content: string, filePath: string): string {
  // Try frontmatter name
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  if (nameMatch) return nameMatch[1].trim();
  // Try first heading
  const headingMatch = content.match(/^#+\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  // Fallback to filename
  return path.basename(filePath, path.extname(filePath)).replace(/[-_]/g, " ");
}

function extractProject(filePath: string): string {
  const user = require("os").userInfo().username;
  const memMatch = filePath.match(new RegExp(`-Users-${user}-Sites-([^/]+)/`));
  if (memMatch) return memMatch[1];
  const home = require("os").homedir();
  const siteMatch = filePath.match(new RegExp(`${home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/Sites/([^/]+)/`));
  if (siteMatch) return siteMatch[1];
  return "global";
}

function chunkByHeadings(content: string): string[] {
  const lines = content.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^#{1,3}\s/.test(line) && current.length > 0) {
      const text = current.join("\n").trim();
      if (text.length > 50) chunks.push(text);
      current = [line];
    } else {
      current.push(line);
    }
  }

  const last = current.join("\n").trim();
  if (last.length > 50) chunks.push(last);

  // If no headings found or single chunk too large, split by paragraphs
  if (chunks.length === 0 && content.trim().length > 50) {
    chunks.push(content.trim());
  }

  // Split chunks that are too large (>1600 chars ≈ 400 tokens)
  const final: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= 1600) {
      final.push(chunk);
    } else {
      const paragraphs = chunk.split(/\n\n+/);
      let buf = "";
      for (const p of paragraphs) {
        if (buf.length + p.length > 1600 && buf.length > 50) {
          final.push(buf.trim());
          buf = p;
        } else {
          buf += (buf ? "\n\n" : "") + p;
        }
      }
      if (buf.trim().length > 50) final.push(buf.trim());
    }
  }

  return final;
}

function roughTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

type SourceFile = {
  path: string;
  type: "global_rules" | "claude_md" | "memory";
};

export async function discoverSources(): Promise<SourceFile[]> {
  const sources: SourceFile[] = [];

  // 1. Global CLAUDE.md
  const globalPath = path.join(process.env.HOME || "", ".claude", "CLAUDE.md");
  if (fs.existsSync(globalPath)) {
    sources.push({ path: globalPath, type: "global_rules" });
  }

  // 2. Per-project CLAUDE.md files
  const home = process.env.HOME || require("os").homedir();
  const projectClaudes = await glob(path.join(home, "Sites/*/CLAUDE.md"));
  for (const p of projectClaudes) {
    sources.push({ path: p, type: "claude_md" });
  }

  // 3. Memory files
  const memoryFiles = await glob(path.join(home, ".claude/projects/*/memory/*.md"));
  for (const p of memoryFiles) {
    sources.push({ path: p, type: "memory" });
  }

  return sources;
}

export function ingestFile(filePath: string, sourceType: string): { status: "created" | "updated" | "skipped"; chunks: number } {
  const db = getDb();
  const content = fs.readFileSync(filePath, "utf-8");
  const hash = sha256(content);

  // Check if already ingested with same hash
  const existing = db.prepare("SELECT id, content_hash FROM documents WHERE source_path = ?").get(filePath) as { id: number; content_hash: string } | undefined;

  if (existing && existing.content_hash === hash) {
    return { status: "skipped", chunks: 0 };
  }

  const title = extractTitle(content, filePath);
  const project = extractProject(filePath);
  const chunks = chunkByHeadings(content);

  const upsert = db.transaction(() => {
    let docId: number;

    if (existing) {
      db.prepare("UPDATE documents SET content = ?, content_hash = ?, title = ?, project = ?, updated_at = datetime('now') WHERE id = ?")
        .run(content, hash, title, project, existing.id);
      db.prepare("DELETE FROM chunks WHERE doc_id = ?").run(existing.id);
      docId = existing.id;
    } else {
      const result = db.prepare("INSERT INTO documents (source_path, source_type, project, title, content, content_hash) VALUES (?, ?, ?, ?, ?, ?)")
        .run(filePath, sourceType, project, title, content, hash);
      docId = result.lastInsertRowid as number;
    }

    for (let i = 0; i < chunks.length; i++) {
      db.prepare("INSERT INTO chunks (doc_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?)")
        .run(docId, i, chunks[i], roughTokenCount(chunks[i]));
    }
  });

  upsert();
  return { status: existing ? "updated" : "created", chunks: chunks.length };
}

export async function ingestAll(): Promise<{ total: number; created: number; updated: number; skipped: number; chunks: number; prefsExtracted: number }> {
  const sources = await discoverSources();
  const db = getDb();
  let created = 0, updated = 0, skipped = 0, totalChunks = 0;

  for (const src of sources) {
    const result = ingestFile(src.path, src.type);
    if (result.status === "created") created++;
    else if (result.status === "updated") updated++;
    else skipped++;
    totalChunks += result.chunks;
  }

  // Rebuild FTS index
  syncFts(db);

  // Auto-extract preferences if any docs changed
  let prefsExtracted = 0;
  if (created > 0 || updated > 0) {
    try {
      prefsExtracted = await extractPreferences();
    } catch (e) {
      console.error("Preference extraction failed:", e);
    }
  }

  return { total: sources.length, created, updated, skipped, chunks: totalChunks, prefsExtracted };
}
