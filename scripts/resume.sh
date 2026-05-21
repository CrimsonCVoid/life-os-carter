#!/bin/bash
#
# resume — launch Claude Code with the project handoff preloaded and all
# permission prompts bypassed. Designed for "pick up where the last session
# ended, don't ask, just keep going."
#
# Usage:
#   bash ~/Downloads/life-os-carter/scripts/resume.sh
#
# Or alias it (recommended):
#   echo 'alias life="bash ~/Downloads/life-os-carter/scripts/resume.sh"' >> ~/.zshrc
#   source ~/.zshrc
#   # then just: `life`
#
# WARNING: --dangerously-skip-permissions removes every confirmation
# prompt. The agent will run any shell command, edit any file, push any
# branch without asking. Trust the agent and the repo state before using.

set -euo pipefail

PROJECT_DIR="${LIFE_OS_DIR:-$HOME/Downloads/life-os-carter}"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Project dir not found: $PROJECT_DIR" >&2
  echo "Override with: LIFE_OS_DIR=/path/to/repo $0" >&2
  exit 1
fi

cd "$PROJECT_DIR"

if [ ! -f HANDOFF.md ]; then
  echo "HANDOFF.md not found in $PROJECT_DIR" >&2
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code CLI not found in PATH." >&2
  echo "Install: https://docs.claude.com/en/docs/claude-code/quickstart" >&2
  exit 1
fi

# Build the initial prompt: handoff content + a one-line acknowledge gate
# so the agent reads before doing anything.
PROMPT=$(cat <<EOF
You're resuming work on Life OS. Read this handoff in full, then reply
with ONE LINE confirming you've absorbed it. Wait for my next instruction.
Do not start any work until I give you a task.

------ HANDOFF ------

$(cat HANDOFF.md)

------ END HANDOFF ------

Acknowledge with one line.
EOF
)

# --dangerously-skip-permissions = no prompts for shell commands, file
# edits, pushes, etc. Carter runs this knowingly.
exec claude --dangerously-skip-permissions "$PROMPT"
