#!/usr/bin/env bash
# Launches a fresh Claude Code session against the Life OS native iOS
# port, bypassing per-tool permission prompts and priming the agent to
# read HANDOFF-NATIVE.md for full context before issuing any commands.
#
# Usage:
#   ./scripts/handoff-native.sh
#
# Safety net: caffeinate -dimsu keeps the Mac awake for 2h so the
# agent doesn't get killed mid-task by sleep/screensaver. The PID is
# logged so you can kill it manually if needed.
#
# Pair file: HANDOFF-NATIVE.md at the repo root. Edit that file to
# change what the agent reads on boot — this script only locates and
# hands off to it.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HANDOFF_PATH="$REPO_ROOT/HANDOFF-NATIVE.md"

cd "$REPO_ROOT"

if [[ ! -f "$HANDOFF_PATH" ]]; then
  echo "❌ HANDOFF-NATIVE.md missing at $HANDOFF_PATH"
  exit 1
fi

# Find a working Claude CLI binary. Prefer the global install; fall
# back to npx invocation.
#
# BYPASS PERMISSIONS — both flags are passed so this works on every
# Claude Code release (newer ones use --permission-mode, older ones
# use --dangerously-skip-permissions; passing both is harmless on
# either side). The session auto-approves Bash / Write / Edit / Agent
# calls so the resumed session can move quickly through planned work
# without a permission prompt on every tool use.
BYPASS_FLAGS=(--permission-mode bypassPermissions --dangerously-skip-permissions)

if command -v claude >/dev/null 2>&1; then
  CLAUDE_CMD=(claude "${BYPASS_FLAGS[@]}")
else
  CLAUDE_CMD=(npx --yes @anthropic-ai/claude-code "${BYPASS_FLAGS[@]}")
fi

# Keep the Mac awake for 2h so a long-running session doesn't die.
# -d = don't sleep, -i = don't idle-sleep, -m = don't disk-sleep,
# -s = don't system-sleep (AC only), -u = assert user-active,
# -t 7200 = 2h
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dimsu -t 7200 &
  CAFFEINATE_PID=$!
  echo "☕ caffeinate pid $CAFFEINATE_PID (kill manually if you finish early)"
  trap 'kill "$CAFFEINATE_PID" 2>/dev/null || true' EXIT
fi

# Verify xcodegen is available — the project is regenerated from
# native/project.yml on every session resume. Without xcodegen the
# agent can't iterate on Xcode project structure.
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "⚠️  xcodegen not found — install with: brew install xcodegen"
  echo "    Continuing anyway; the agent will surface this if needed."
fi

# Inline prompt the new session boots into. The agent's first action
# will be to read the handoff doc; everything else flows from there.
PROMPT=$(cat <<'EOF'
Read /Users/carterbrady/Downloads/life-os-hbrady/HANDOFF-NATIVE.md in
full before issuing any commands. Then run the pre-flight checks
listed in the "Pre-flight before issuing your first command" section
(git status, branch, log, fetch, xcodegen, xcodebuild sanity) and
report the state in a short summary. Wait for direction on which open
item to tackle next.
EOF
)

echo "🚀 launching Claude Code in $REPO_ROOT"
echo "   permission-mode: bypassPermissions (no tool-use prompts)"
echo "──────────────────────────────────────────────────────────"
echo "$PROMPT" | "${CLAUDE_CMD[@]}"
