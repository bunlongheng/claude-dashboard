#!/usr/bin/env node
/**
 * Sync app icons from local-apps API to public/app-icons/
 * Run: node scripts/sync-icons.mjs
 * Fetches icon map once, downloads only new/changed icons.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ICONS_DIR = join(ROOT, "public", "app-icons");
const MANIFEST_PATH = join(ICONS_DIR, "manifest.json");
const LOCAL_APPS_API = process.env.LOCAL_APPS_URL || "http://localhost:9875";
// Client work never ships in this public repo: no icon, no manifest entry.
const SKIP = new Set(["kactus", "kactus-qa", "distributor-portal", "partners", "pm2020", "pm2020-tools", "pm2026"]);

mkdirSync(ICONS_DIR, { recursive: true });

// Load existing manifest
let manifest = {};
try { manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")); } catch {}

async function sync() {
    console.log("Syncing app icons...");

    // 1. Fetch favicon map from local-apps
    let faviconMap;
    try {
        const res = await fetch(`${LOCAL_APPS_API}/api/favicons`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`${res.status}`);
        faviconMap = await res.json();
    } catch (e) {
        console.log(`  Could not reach local-apps API (${e.message}). Using existing icons.`);
        return;
    }

    const entries = Object.entries(faviconMap);
    console.log(`  Found ${entries.length} apps`);

    let downloaded = 0;
    let unchanged = 0;
    let failed = 0;

    for (const [name, iconPath] of entries) {
        if (SKIP.has(name)) continue;
        const url = `${LOCAL_APPS_API}${iconPath}`;
        const ext = iconPath.includes(".svg") ? ".svg" : ".png";
        const localPath = join(ICONS_DIR, `${name}${ext}`);
        const relPath = `/app-icons/${name}${ext}`;

        // Check if we already have this version
        const versionMatch = iconPath.match(/[?&]v=(\d+)/);
        const remoteVersion = versionMatch ? versionMatch[1] : "";
        const existing = manifest[name];

        if (existing && existing.version === remoteVersion && existsSync(localPath)) {
            unchanged++;
            continue;
        }

        // Download
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error(`${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            writeFileSync(localPath, buf);

            const hash = createHash("md5").update(buf).digest("hex").slice(0, 8);
            manifest[name] = { path: relPath, version: remoteVersion, hash, synced: new Date().toISOString().slice(0, 10) };
            downloaded++;
            console.log(`  + ${name}${ext} (${(buf.length / 1024).toFixed(1)}KB)`);
        } catch (e) {
            failed++;
            console.log(`  x ${name} failed: ${e.message}`);
        }
    }

    // Write manifest
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`\nDone: ${downloaded} downloaded, ${unchanged} unchanged, ${failed} failed`);
    console.log(`Total: ${Object.keys(manifest).length} icons in public/app-icons/`);
}

sync();
