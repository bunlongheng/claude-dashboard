#!/usr/bin/env node
/**
 * Claude WS Server — lightweight replacement for the Rust claude-progress binary.
 * Watches ~/.claude/projects/ for session file changes and broadcasts via WebSocket.
 *
 * Usage:  node scripts/ws-server.mjs
 * Port:   7878 (or PORT env var)
 * Health: GET http://localhost:7878/api/health
 */

import { createServer } from "http";
import { WebSocketServer } from "ws";
import { watch, readFileSync, statSync, existsSync, readdirSync, openSync, readSync, closeSync } from "fs";
import { join } from "path";
import { homedir, hostname } from "os";

const PORT = parseInt(process.env.PORT || "7878", 10);
const CLAUDE_DIR = join(homedir(), ".claude", "projects");

// Detect machine name from hostname
import { execSync } from "child_process";

function detectMachine() {
    const h = hostname().toLowerCase();
    if (h.includes("m4") || h.includes("mac-mini")) return "M4";
    if (h.includes("m2")) return "M2";
    if (h.includes("m1")) return "M1";
    if (h.includes("pi") || h.includes("raspberry")) return "Pi5";
    try {
        const cpu = execSync("sysctl -n machdep.cpu.brand_string 2>/dev/null", { encoding: "utf-8" }).trim();
        if (cpu.includes("M4")) return "M4";
        if (cpu.includes("M2")) return "M2";
        if (cpu.includes("M1")) return "M1";
    } catch {}
    return hostname().split(".")[0];
}

const MACHINE = process.env.MACHINE || detectMachine();

// Track file sizes for tail-reading new lines
const fileSizes = new Map();

// Connected WebSocket clients per session
const sessionClients = new Map(); // sessionId -> Set<ws>

// ─── HTTP server ────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (req.url === "/api/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", machine: MACHINE, uptime: process.uptime() | 0 }));
        return;
    }

    if (req.url === "/api/sessions") {
        const sessions = getActiveSessions();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ machine: MACHINE, sessions }));
        return;
    }

    res.writeHead(404);
    res.end("Not found");
});

// ─── WebSocket server ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
    // Extract session ID from /ws/:sessionId
    const match = req.url?.match(/^\/ws\/(.+)$/);
    const sessionId = match?.[1];

    if (!sessionId) {
        ws.send(JSON.stringify({ type: "error", message: "No session ID in URL" }));
        ws.close();
        return;
    }

    if (!sessionClients.has(sessionId)) sessionClients.set(sessionId, new Set());
    sessionClients.get(sessionId).add(ws);

    ws.send(JSON.stringify({ type: "connected", sessionId, machine: MACHINE }));

    ws.on("close", () => {
        sessionClients.get(sessionId)?.delete(ws);
        if (sessionClients.get(sessionId)?.size === 0) sessionClients.delete(sessionId);
    });

    ws.on("message", (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === "input" && msg.text) {
                // Could forward input to Claude CLI — placeholder
                ws.send(JSON.stringify({ type: "ack", message: "Input received" }));
            }
        } catch {}
    });
});

// ─── File watcher ───────────────────────────────────────────────────────────
function getActiveSessions() {
    const sessions = [];
    if (!existsSync(CLAUDE_DIR)) return sessions;

    for (const folder of readdirSync(CLAUDE_DIR)) {
        const folderPath = join(CLAUDE_DIR, folder);
        try {
            if (!statSync(folderPath).isDirectory()) continue;
            for (const file of readdirSync(folderPath)) {
                if (!file.endsWith(".jsonl")) continue;
                const filePath = join(folderPath, file);
                const stat = statSync(filePath);
                const age = Date.now() - stat.mtime.getTime();
                if (age < 3600_000) { // active in last hour
                    sessions.push({
                        sessionId: file.replace(".jsonl", ""),
                        project: folder,
                        updatedAt: stat.mtime.toISOString(),
                        sizeBytes: stat.size,
                    });
                }
            }
        } catch {}
    }
    return sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function readNewLines(filePath) {
    try {
        const stat = statSync(filePath);
        const prevSize = fileSizes.get(filePath) || 0;

        if (stat.size <= prevSize) {
            fileSizes.set(filePath, stat.size);
            return [];
        }

        const buf = Buffer.alloc(stat.size - prevSize);
        const fd = openSync(filePath, "r");
        readSync(fd, buf, 0, buf.length, prevSize);
        closeSync(fd);

        fileSizes.set(filePath, stat.size);

        return buf.toString("utf-8").split("\n").filter(Boolean).map(line => {
            try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
    } catch {
        return [];
    }
}

function broadcastToSession(sessionId, data) {
    const clients = sessionClients.get(sessionId);
    if (!clients || clients.size === 0) return;
    const msg = JSON.stringify(data);
    for (const ws of clients) {
        try { ws.send(msg); } catch {}
    }
}

function processNewLine(sessionId, line) {
    if (line.type === "user") {
        const content = typeof line.message?.content === "string"
            ? line.message.content
            : Array.isArray(line.message?.content)
                ? line.message.content.find(b => b.type === "text")?.text || ""
                : "";
        broadcastToSession(sessionId, { type: "user_msg", content: content.slice(0, 500), timestamp: line.timestamp });
    } else if (line.type === "assistant") {
        // Extract tool use, thinking, text
        const blocks = line.message?.content || [];
        for (const block of (Array.isArray(blocks) ? blocks : [])) {
            if (block.type === "thinking") {
                broadcastToSession(sessionId, { type: "thinking", content: block.thinking?.slice(0, 300) || "", timestamp: line.timestamp });
            } else if (block.type === "tool_use") {
                broadcastToSession(sessionId, { type: "tool", toolName: block.name, content: JSON.stringify(block.input || {}).slice(0, 300), timestamp: line.timestamp });
            } else if (block.type === "text") {
                broadcastToSession(sessionId, { type: "text", content: block.text?.slice(0, 500) || "", timestamp: line.timestamp });
            }
        }
    } else if (line.type === "summary" && line.summary?.usage) {
        const u = line.summary.usage;
        broadcastToSession(sessionId, {
            type: "usage",
            input_tokens: u.input_tokens || 0,
            output_tokens: u.output_tokens || 0,
            cache_read: u.cache_read_input_tokens || 0,
            cache_creation: u.cache_creation_input_tokens || 0,
            model: line.summary.model || "",
            timestamp: line.timestamp,
        });
    } else if (line.type === "custom-title") {
        broadcastToSession(sessionId, { type: "title", title: line.customTitle, timestamp: line.timestamp });
    }
}

// Watch all project folders
function startWatching() {
    if (!existsSync(CLAUDE_DIR)) {
        console.log(`⚠ ${CLAUDE_DIR} not found — will retry in 10s`);
        setTimeout(startWatching, 10_000);
        return;
    }

    const watchers = new Map();

    function watchFolder(folderPath) {
        if (watchers.has(folderPath)) return;
        try {
            const w = watch(folderPath, (event, filename) => {
                if (!filename?.endsWith(".jsonl")) return;
                const filePath = join(folderPath, filename);
                const sessionId = filename.replace(".jsonl", "");
                const newLines = readNewLines(filePath);
                for (const line of newLines) {
                    processNewLine(sessionId, line);
                }
            });
            watchers.set(folderPath, w);
        } catch {}
    }

    // Watch existing folders
    for (const folder of readdirSync(CLAUDE_DIR)) {
        const folderPath = join(CLAUDE_DIR, folder);
        try { if (statSync(folderPath).isDirectory()) watchFolder(folderPath); } catch {}
    }

    // Watch for new project folders
    watch(CLAUDE_DIR, (event, filename) => {
        if (!filename) return;
        const folderPath = join(CLAUDE_DIR, filename);
        try { if (statSync(folderPath).isDirectory()) watchFolder(folderPath); } catch {}
    });

    console.log(`👀 Watching ${watchers.size} project folders`);
}

// ─── Start ──────────────────────────────────────────────────────────────────
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Claude WS Server [${MACHINE}]`);
    console.log(`   http://0.0.0.0:${PORT}/api/health`);
    console.log(`   ws://0.0.0.0:${PORT}/ws/:sessionId`);
    startWatching();
});
