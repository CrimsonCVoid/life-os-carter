#!/bin/sh
# Xcode Cloud post-clone hook.
#
# Xcode Cloud clones the repo into a fresh sandbox before each build.
# The .xcodeproj is gitignored (we generate it from project.yml via
# xcodegen), so we need to install xcodegen + regenerate the project
# before Xcode Cloud's archive step runs.
#
# Lives at the repo root in /ci_scripts/. Xcode Cloud auto-discovers
# scripts named ci_post_clone.sh / ci_pre_xcodebuild.sh / ci_post_xcodebuild.sh.

set -e

echo "[ci_post_clone] PATH=$PATH"
echo "[ci_post_clone] Working dir: $(pwd)"

# Xcode Cloud's sandbox has Homebrew pre-installed but xcodegen isn't.
# Install it via brew — fast (~30s on a cold cache) and idempotent.
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "[ci_post_clone] Installing xcodegen via brew…"
  brew install xcodegen
else
  echo "[ci_post_clone] xcodegen already installed: $(xcodegen --version)"
fi

# Regenerate native/LifeOS.xcodeproj from project.yml so the workflow's
# archive step has something to build.
echo "[ci_post_clone] Regenerating xcodeproj…"
cd "$CI_PRIMARY_REPOSITORY_PATH/native"
xcodegen generate

echo "[ci_post_clone] Done. Project ready at $(pwd)/LifeOS.xcodeproj"
