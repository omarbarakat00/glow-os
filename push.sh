#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "→ Initialising git repo..."
git init
git config user.email "omarbarakat00@gmail.com"
git config user.name "Omar Barakat"
git remote add origin https://github.com/omarbarakat00/glow-os.git 2>/dev/null || git remote set-url origin https://github.com/omarbarakat00/glow-os.git
echo "→ Staging files..."
git add -A
git commit -m "v2: real API integration via Vercel serverless functions"
git branch -M main
echo "→ Pushing to GitHub..."
git push -f origin main
echo ""
echo "✓ Done! Now go to vercel.com and import omarbarakat00/glow-os"
