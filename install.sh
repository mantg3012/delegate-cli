#!/bin/sh
# Install ag: link it into ~/.local/bin, link the Claude Code skills, make sure ~/.local/bin is on PATH.
# Safe to run again. Links point at this folder, so do not move or delete it afterwards.
set -e
DIR=$(cd "$(dirname "$0")" && pwd)

major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$major" -ge 22 ] || { echo "install: need Node 22+ (found: $(node -v 2>/dev/null || echo none))" >&2; exit 1; }

chmod +x "$DIR/ag.mjs"
mkdir -p "$HOME/.local/bin" "$HOME/.claude/skills"
ln -sfn "$DIR/ag.mjs" "$HOME/.local/bin/ag"
for s in antigravity-desktop delegate-cli; do
  T="$HOME/.claude/skills/$s"
  # a real folder there (old copy) would make ln put the link inside it; back it up outside skills/ so it is not loaded twice
  if [ -d "$T" ] && [ ! -L "$T" ]; then B="$HOME/.claude/skills-backup/$s.$(date +%Y%m%d%H%M%S)"; mkdir -p "${B%/*}"; mv "$T" "$B"; echo "moved old $T to $B"; fi
  ln -sfn "$DIR/skills/$s" "$T"
done

RC="$HOME/.zshrc"
if ! grep -qs '\.local/bin' "$RC"; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$RC"
  echo "added ~/.local/bin to PATH in $RC"
fi

echo "installed: ~/.local/bin/ag, ~/.claude/skills/{antigravity-desktop,delegate-cli}"
echo
echo "Next:"
echo "  1. Open a new terminal tab (or: source ~/.zshrc)"
echo "  2. Quit Antigravity (Cmd+Q)"
echo "  3. ag start"
echo "  4. ag doctor   -> should print: ok: all ... selectors match"
