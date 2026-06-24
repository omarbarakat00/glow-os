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
git commit -m "v3: Finance module — Supabase DB, 7 input forms, auto-calculations"
git branch -M main
echo "→ Pushing to GitHub..."
git push -f origin main
echo ""
echo "✓ Done! Vercel will auto-deploy in ~30 seconds."
