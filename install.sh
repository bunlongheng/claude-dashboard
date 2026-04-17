#!/bin/bash
# Claude Dashboard - One-line installer
# Usage: curl -fsSL https://raw.githubusercontent.com/bunlongheng/claude-dashboard/main/install.sh | bash

set -e

REPO="https://github.com/bunlongheng/claude-dashboard.git"
ZIP="https://github.com/bunlongheng/claude-dashboard/archive/refs/heads/main.zip"
DIR="claude-dashboard"
PORT=3000

echo ""
echo "  ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗"
echo " ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝"
echo " ██║     ██║     ███████║██║   ██║██║  ██║█████╗  "
echo " ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  "
echo " ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗"
echo "  ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝"
echo "  Dashboard for Claude Code"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "  Node.js is required. Install it from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "  Node.js 18+ required (you have $(node -v))"
    exit 1
fi

# Check Claude Code
if [ ! -d "$HOME/.claude" ]; then
    echo "  Claude Code is not installed (~/.claude not found)."
    echo "  The dashboard needs Claude Code to work."
    echo ""
    echo "  Install Claude Code first:"
    echo "  https://docs.anthropic.com/en/docs/claude-code"
    echo ""
    exit 1
fi

# Download - git if available, otherwise zip
if [ -d "$DIR" ]; then
    echo "  Directory '$DIR' already exists. Updating..."
    cd "$DIR"
    if command -v git &> /dev/null && [ -d ".git" ]; then
        git pull --quiet
    fi
    cd ..
elif command -v git &> /dev/null; then
    echo "  Cloning..."
    git clone --depth 1 "$REPO" "$DIR" --quiet
else
    echo "  Downloading..."
    curl -fsSL "$ZIP" -o /tmp/claude-dashboard.zip
    unzip -q /tmp/claude-dashboard.zip -d /tmp
    mv /tmp/claude-dashboard-main "$DIR"
    rm /tmp/claude-dashboard.zip
fi

cd "$DIR"

echo "  Installing dependencies..."
npm install --silent 2>/dev/null

echo ""
echo "  Done! Start the dashboard:"
echo ""
echo "    cd $DIR"
echo "    npm run dev"
echo ""
echo "  Then open http://localhost:$PORT"
echo ""
