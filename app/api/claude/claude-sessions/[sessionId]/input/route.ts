import { NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");
const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

function findSessionFile(sessionId: string): string | null {
    if (!SAFE_ID.test(sessionId)) return null;
    try {
        for (const folder of fs.readdirSync(CLAUDE_DIR)) {
            if (!SAFE_ID.test(folder)) continue;
            const fp = path.join(CLAUDE_DIR, folder, `${sessionId}.jsonl`);
            if (fs.existsSync(fp)) return fp;
        }
    } catch {}
    return null;
}

function getSessionCwd(sessionId: string): string | null {
    const fp = findSessionFile(sessionId);
    if (!fp) return null;
    // Read first 16KB to find cwd from first user message
    let fd = -1;
    try {
        fd = fs.openSync(fp, "r");
        const buf = Buffer.alloc(16384);
        const bytesRead = fs.readSync(fd, buf, 0, 16384, 0);
        const chunk = buf.subarray(0, bytesRead).toString("utf-8");
        for (const line of chunk.split("\n")) {
            if (!line.trim()) continue;
            try {
                const obj = JSON.parse(line);
                if (obj.type === "user" && obj.cwd) return obj.cwd;
            } catch {}
        }
    } catch {}
    finally { if (fd >= 0) try { fs.closeSync(fd); } catch {} }
    return null;
}

function findTtyForCwd(cwd: string): string | null {
    try {
        // Match exact cwd - use claude-code process specifically, not any "claude" match
        const script = `
for pid in $(/usr/bin/pgrep -f "claude" 2>/dev/null); do
    # Skip this dashboard's own processes
    cmd=$(/bin/ps -o command= -p "$pid" 2>/dev/null)
    case "$cmd" in *next*|*node*scripts/ws*) continue ;; esac
    proc_cwd=$(/usr/sbin/lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | /usr/bin/grep '^n' | /usr/bin/sed 's/^n//')
    if [ "$proc_cwd" = "$INJECT_CWD" ]; then
        tty=$(/bin/ps -o tty= -p "$pid" 2>/dev/null | /usr/bin/tr -d ' ')
        if [ -n "$tty" ] && [ "$tty" != "??" ]; then
            echo "/dev/$tty"
            exit 0
        fi
    fi
done
exit 1`;
        const out = execSync(script, {
            encoding: "utf-8",
            env: { ...process.env, INJECT_CWD: cwd },
            timeout: 5000,
        }).trim();
        return out || null;
    } catch {
        return null;
    }
}

function injectViaIterm2(ttyPath: string, text: string): boolean {
    const script = `
set ttyTarget to (system attribute "INJECT_TTY")
set inputText to (system attribute "INJECT_TEXT")
tell application "iTerm2"
    repeat with w in windows
        repeat with t in tabs of w
            repeat with s in sessions of t
                try
                    if (tty of s) = ttyTarget then
                        tell s to write text inputText newline NO
                        do shell script "printf '\\\\033[?2004l' > " & quoted form of ttyTarget
                        delay 0.05
                        tell s to write text (ASCII character 13) newline NO
                        do shell script "printf '\\\\033[?2004h' > " & quoted form of ttyTarget
                        return "ok"
                    end if
                end try
            end repeat
        end repeat
    end repeat
    return "not_found"
end tell`;
    try {
        const out = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
            encoding: "utf-8",
            env: { ...process.env, INJECT_TTY: ttyPath, INJECT_TEXT: text },
            timeout: 10000,
        }).trim();
        return out === "ok";
    } catch {
        return false;
    }
}

function ttyIsVscode(ttyPath: string): boolean {
    const dev = ttyPath.replace("/dev/", "");
    try {
        const out = execSync(`
for pid in $(ps -e -o pid,tty | awk -v d="${dev}" '$2==d {print $1}'); do
    ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    if [ -n "$ppid" ]; then
        cmd=$(ps -o command= -p "$ppid" 2>/dev/null)
        echo "$cmd"
        exit 0
    fi
done`, { encoding: "utf-8", timeout: 5000 }).toLowerCase();
        return out.includes("electron") || out.includes("visual studio code") || out.includes("code helper");
    } catch {
        return false;
    }
}

function injectViaVscode(text: string): boolean {
    const script = `
set inputText to (system attribute "INJECT_TEXT")
tell application "Visual Studio Code" to activate
delay 0.25
tell application "System Events"
    tell process "Electron"
        key code 50 using control down
        delay 0.2
        keystroke inputText
        delay 0.1
        key code 36
    end tell
end tell
return "ok"`;
    try {
        execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
            encoding: "utf-8",
            env: { ...process.env, INJECT_TEXT: text },
            timeout: 10000,
        });
        return true;
    } catch {
        return false;
    }
}

function injectToTty(cwd: string, text: string): boolean {
    const ttyPath = findTtyForCwd(cwd);
    if (!ttyPath) return false;

    // Try iTerm2 first
    if (injectViaIterm2(ttyPath, text)) return true;

    // Fall back to VS Code
    if (ttyIsVscode(ttyPath)) return injectViaVscode(text);

    return false;
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;
    const { text } = await req.json();

    if (!text?.trim()) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });

    const cwd = getSessionCwd(sessionId);
    if (!cwd) return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });

    const ok = injectToTty(cwd, text);
    return NextResponse.json({ ok, cwd });
}
