#!/usr/bin/env bash
#
# check-docs.sh — run the whole zero-dep Markdown linting suite in one command.
#
# Wires together the eight linters in this repo so CI (or a pre-commit hook) can
# call ONE thing instead of eight:
#
#   link-check.js        broken local links / dead anchors        (default: ON)
#   code-fence-lint.js   unclosed / mismatched code fences        (default: ON)
#   image-alt-lint.js    images missing or weak alt text (a11y)   (default: ON)
#   frontmatter-lint.js  bad YAML frontmatter (files that have it) (default: ON)
#   list-lint.js         mixed bullets / broken ordered numbering (default: ON)
#   heading-lint.js      heading structure / duplicate anchors    (default: OFF — opt-in)
#   table-fmt.js         GFM tables not aligned                    (default: OFF — opt-in)
#   markdown-toc.js      <!-- TOC --> block out of date           (opt-in via TOC_FILES)
#
# Why some are OFF by default: heading-lint flags duplicate heading *slugs*, and
# table-fmt enforces one specific alignment — both are legitimate, but a repo can
# reasonably repeat sub-headings across sections or hand-format its tables. Those
# checks fail on style choices, not bugs, so they're opt-in. The five ON-by-default
# checks only fail on genuine defects (a dead link, an unclosed fence, a missing
# alt attribute, malformed frontmatter, a list that mixes bullet markers or botches
# its numbering), so they're safe to gate every build. (list-lint's odd-indent rule
# is a non-failing warning, so it never breaks a build on its own.)
#
# Every check is individually toggleable with an env var (1 = run, 0 = skip):
#
#   CHECK_LINKS CHECK_FENCES CHECK_ALT CHECK_FRONTMATTER CHECK_LISTS CHECK_HEADINGS CHECK_TABLES
#
# Exit codes: 0 = everything passed, 1 = a check failed. Safe for CI and pre-commit.
#
# Usage:
#   examples/check-docs.sh                      # the four safe checks over the repo
#   CHECK_HEADINGS=1 CHECK_TABLES=1 examples/check-docs.sh   # strict: run everything
#   CHECK_ALT=0 examples/check-docs.sh          # skip the alt-text check
#   TOC_FILES="README.md" examples/check-docs.sh            # also verify README's TOC
#   SCRIPTS_DIR=. examples/check-docs.sh        # if the scripts live somewhere custom
#
# Requires: node, git. Zero npm dependencies.

set -euo pipefail

# Where the linter scripts live. Default: repo root (one level up from examples/).
SCRIPTS_DIR="${SCRIPTS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Per-check toggles. Defaults: the four defect-only checks ON, the two style checks OFF.
CHECK_LINKS="${CHECK_LINKS:-1}"
CHECK_FENCES="${CHECK_FENCES:-1}"
CHECK_ALT="${CHECK_ALT:-1}"
CHECK_FRONTMATTER="${CHECK_FRONTMATTER:-1}"
CHECK_LISTS="${CHECK_LISTS:-1}"
CHECK_HEADINGS="${CHECK_HEADINGS:-0}"
CHECK_TABLES="${CHECK_TABLES:-0}"

# Files with <!-- TOC --> markers whose TOC should be verified. Space-separated.
# Leave empty to skip the TOC check entirely.
TOC_FILES="${TOC_FILES:-}"

fail=0

# Collect every tracked Markdown file (skip vendored trees).
mapfile -t md_files < <(git ls-files '*.md' '*.markdown' | grep -vE '(^|/)(node_modules|vendor)/' || true)

if [ "${#md_files[@]}" -eq 0 ]; then
  echo "No Markdown files tracked by git — nothing to check."
  exit 0
fi

echo "Linting ${#md_files[@]} Markdown file(s)…"

# run_check <toggle> <label> <script> [extra args…] — run one linter over every md file,
# record a failure without aborting the rest (so one run reports ALL problems).
run_check() {
  local toggle="$1" label="$2" script="$3"; shift 3
  [ "$toggle" = "1" ] || return 0
  echo "→ $label"
  if ! node "$SCRIPTS_DIR/$script" "${md_files[@]}" "$@"; then
    fail=1
  fi
}

run_check "$CHECK_LINKS"       "links (link-check)"            link-check.js
run_check "$CHECK_FENCES"      "code fences (code-fence-lint)" code-fence-lint.js
run_check "$CHECK_ALT"         "image alt text (image-alt-lint)" image-alt-lint.js
run_check "$CHECK_FRONTMATTER" "frontmatter (frontmatter-lint)" frontmatter-lint.js --allow-missing
run_check "$CHECK_LISTS"       "lists (list-lint)"             list-lint.js
run_check "$CHECK_HEADINGS"    "headings (heading-lint)"       heading-lint.js
run_check "$CHECK_TABLES"      "tables (table-fmt --check)"    table-fmt.js --check

# Opt-in TOC freshness check (per-file, only for files that use TOC markers).
if [ -n "$TOC_FILES" ]; then
  echo "→ table of contents (markdown-toc --check)"
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
