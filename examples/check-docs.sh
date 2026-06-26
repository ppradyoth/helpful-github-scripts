#!/usr/bin/env bash
#
# check-docs.sh — run the docs checks across a repo in one command.
#
# What it does:
#   1. Finds every Markdown file tracked by git (skips .git, node_modules, vendor).
#   2. Runs link-check.js over all of them — fails on any broken local link or dead anchor.
#   3. Optionally runs markdown-toc.js --check on files that opt in (see TOC_FILES below).
#
# Exit codes: 0 = everything passes, 1 = a check failed. Safe for CI and pre-commit.
#
# Usage:
#   examples/check-docs.sh                 # check the whole repo
#   SCRIPTS_DIR=. examples/check-docs.sh   # if the scripts live somewhere custom
#
# Requires: node, git. Zero npm dependencies.

set -euo pipefail

# Where link-check.js / markdown-toc.js live. Default: repo root (one level up from examples/).
SCRIPTS_DIR="${SCRIPTS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Files that use <!-- TOC --> markers and should have their TOC verified. Space-separated.
# Leave empty to skip the TOC check entirely (link-check still runs on everything).
TOC_FILES="${TOC_FILES:-}"

fail=0

# 1 + 2: link-check every tracked Markdown file.
mapfile -t md_files < <(git ls-files '*.md' '*.markdown' | grep -vE '(^|/)(node_modules|vendor)/' || true)

if [ "${#md_files[@]}" -eq 0 ]; then
  echo "No Markdown files tracked by git — nothing to check."
  exit 0
fi

echo "→ Checking links in ${#md_files[@]} Markdown file(s)…"
if ! node "$SCRIPTS_DIR/link-check.js" "${md_files[@]}"; then
  fail=1
fi

# 3: opt-in TOC freshness check.
if [ -n "$TOC_FILES" ]; then
  echo "→ Checking table of contents is current…"
  for f in $TOC_FILES; do
    if ! node "$SCRIPTS_DIR/markdown-toc.js" "$f" --check; then
      fail=1
    fi
  done
fi

if [ "$fail" -ne 0 ]; then
  echo "✗ Docs checks failed."
  exit 1
fi

echo "✓ All docs checks passed."
