#!/usr/bin/env node
/**
 * Convert public/app-icons/claude.png from "gold brain on black hex" to
 * "white silhouette on transparent". Run from anywhere; paths are absolute.
 *
 * Pixel rule: brightness drives output alpha. Bright pixels become white at
 * proportional alpha; dark pixels go fully transparent. Result is a clean
 * white silhouette of the foreground that drops onto any dashboard surface.
 *
 *   node scripts/whiten-claude-icon.mjs                  -> overwrite claude.png
 *   node scripts/whiten-claude-icon.mjs --out=claude-white.png   -> side-by-side
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.join(__dirname, "..", "public", "app-icons");
const SRC = path.join(ICONS_DIR, "claude.png");

const args = Object.fromEntries(
    process.argv.slice(2).map(a => a.startsWith("--") ? a.slice(2).split("=") : [a, true]),
);
const OUT = path.join(ICONS_DIR, args.out ?? "claude.png");
const THRESHOLD = Number(args.threshold ?? 40);  // pixels darker than this -> transparent
const BACKUP = !args.nobackup;

if (!fs.existsSync(SRC)) { console.error("Source missing:", SRC); process.exit(1); }

// Snapshot the original so we can roll back if the recolor looks wrong.
if (BACKUP && SRC === OUT && !fs.existsSync(SRC + ".orig")) {
    fs.copyFileSync(SRC, SRC + ".orig");
    console.log("  backup ->", SRC + ".orig");
}

const img = sharp(SRC).ensureAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
if (channels !== 4) { console.error("Expected RGBA, got channels=", channels); process.exit(1); }

let kept = 0;
let dropped = 0;
for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Luma (perceptual brightness, 0..255). Black hex bg sits near 0, gold brain near 180-240.
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma < THRESHOLD) {
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;  // fully transparent
        dropped++;
    } else {
        // White silhouette, alpha tracks brightness so the antialiased edges stay soft.
        const alpha = Math.round(Math.min(255, (luma - THRESHOLD) / (255 - THRESHOLD) * 255 + 40));
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = alpha;
        kept++;
    }
}

await sharp(data, { raw: { width, height, channels } }).png().toFile(OUT);
console.log("  wrote ->", OUT);
console.log("  size:", width + "x" + height, "| kept:", kept, "| dropped:", dropped, "| threshold:", THRESHOLD);
