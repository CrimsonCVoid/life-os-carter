#!/usr/bin/env bash
# Launches a fresh Claude Code session against the Life OS v2 project,
# bypassing per-tool permission prompts and priming the agent to read
# HANDOFF-V3.md for full context before issuing any commands.
#
# Usage:
#   ./scripts/handoff.sh
#
# Safety net: caffeinate -dimsu keeps the Mac awake for 2h so the agent
# doesn't get killed mid-task by sleep/screensaver. The PID is logged
# so you can kill it manually if needed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HANDOFF_PATH="$REPO_ROOT/HANDOFF-V3.md"

cd "$REPO_ROOT"

if [[ ! -f "$HANDOFF_PATH" ]]; then
  echo "❌ HANDOFF-V3.md missing at $HANDOFF_PATH"
  exit 1
fi

# Find a working Claude CLI binary. Prefer the global install; fall back
# to npx invocation. Either way, --dangerously-skip-permissions is the
# flag that auto-approves Bash / Write / Edit / Agent calls so the
# resumed session can move quickly through the planned work.
if command -v claude >/dev/null 2>&1; then
  CLAUDE_CMD=(claude --dangerously-skip-permissions)
else
  CLAUDE_CMD=(npx --yes @anthropic-ai/claude-code --dangerously-skip-permissions)
fi

# Keep the Mac awake for 2h so a long-running session doesn't die.
# -d = don't sleep, -i = don't idle-sleep, -m = don't disk-sleep,
# -s = don't system-sleep (AC only), -u = assert user-active, -t 7200 = 2h
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dimsu -t 7200 &
  CAFFEINATE_PID=$!
  echo "☕ caffeinate pid $CAFFEINATE_PID (kill manually if you finish early)"
  trap 'kill "$CAFFEINATE_PID" 2>/dev/null || true' EXIT
fi

# Inline prompt the new session boots into. The agent's first action
# will be to read the handoff doc; everything else flows from there.
PROMPT=$(cat <<'EOF'
Read /Users/carterbrady/Downloads/life-os-hbrady/HANDOFF-V3.md in full
before issuing any commands. Then run the pre-flight checks listed in
the "Pre-flight before issuing your first command" section and report
the state. Wait for direction on which open item to tackle.
EOF
)

echo "🚀 launching Claude Code (skip-permissions) in $REPO_ROOT"
echo "──────────────────────────────────────────────────────────"
echo "$PROMPT" | "${CLAUDE_CMD[@]}"
