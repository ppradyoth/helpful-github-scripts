#!/usr/bin/env bash
#
# check-docs.sh — run the whole zero-dep Markdown linting suite in one command.
#
# Wires together the linters in this repo so CI (or a pre-commit hook) can
# call ONE thing instead of many:
#
#   link-check.js        broken local links / dead anchors        (default: ON)
#   code-fence-lint.js   unclosed / mismatched code fences        (default: ON)
#   image-alt-lint.js    images missing or weak alt text (a11y)   (default: ON)
#   link-text-lint.js    empty / non-descriptive link text (a11y) (default: ON)
#   frontmatter-lint.js  bad YAML frontmatter (files that have it) (default: ON)
#   list-lint.js         mixed bullets / broken ordered numbering (default: ON)
#   whitespace-lint.js   trailing spaces / tabs / CRLF / EOF newline (default: ON)
#   reference-link-lint.js undefined [text][ref] / unused defs    (default: ON)
#   bare-url-lint.js     raw URLs not wrapped in <> or [](). MD034 (default: ON)
#   emphasis-heading-lint.js  whole-line bold/italic used as a heading. MD036 (default: ON)
#   heading-lint.js      heading structure / duplicate anchors    (default: OFF — opt-in)
#   table-fmt.js         GFM tables not aligned                    (default: OFF — opt-in)
#   markdown-toc.js      <!-- TOC --> block out of date           (opt-in via TOC_FILES)
#   changelog-lint.js    CHANGELOG.md not Keep-a-Changelog shape   (auto: ON when a
#                                                                   CHANGELOG.md exists)
#
# Why some are OFF by default: heading-lint flags duplicate heading *slugs*, and
# table-fmt enforces one specific alignment — both are legitimate, but a repo can
# reasonably repeat sub-headings across sections or hand-format its tables. Those
# checks fail on style choices, not bugs, so they're opt-in. The seven ON-by-default
# checks only fail on genuine defects (a dead link, an unclosed fence, a missing
# alt attribute, an empty/whitespace link text, malformed frontmatter, a list that
# mixes bullet markers or botches its numbering, trailing whitespace / hard tabs /
# CRLF / a missing final newline), so they're safe to gate every build. (list-lint's
# odd-indent, whitespace-lint's multiple-blank-lines, and link-text-lint's
# non-descriptive / raw-URL link-text rules are non-failing warnings, so they never
# break a build on their own. reference-link-lint fails only on an undefined
# reference — a link that renders broken; its unused/duplicate-definition findings
# are warnings that fail only under its own --strict, which this suite doesn't pass.)
#
# Every check is individually toggleable with an env var (1 = run, 0 = skip):
#
#   CHECK_LINKS CHECK_FENCES CHECK_ALT CHECK_LINK_TEXT CHECK_FRONTMATTER CHECK_LISTS
#   CHECK_WHITESPACE CHECK_REFS CHECK_BARE_URL CHECK_HEADINGS CHECK_TABLES
#
# Exit codes: 0 = everything passed, 1 = a check failed. Safe for CI and pre-commit.
#
# Usage:
#   examples/check-docs.sh                      # the four safe checks over the repo
#   CHECK_HEADINGS=1 CHECK_TABLES=1 examples/check-docs.sh   # strict: run everything
#   CHECK_ALT=0 examples/check-docs.sh          # skip the alt-text check
#   TOC_FILES="README.md" examples/check-docs.sh            # also verify README's TOC
#   CHANGELOG_FILE=docs/CHANGELOG.md examples/check-docs.sh  # lint a changelog elsewhere
#   CHANGELOG_FILE= examples/check-docs.sh                   # skip the changelog check
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
CHECK_LINK_TEXT="${CHECK_LINK_TEXT:-1}"
CHECK_FRONTMATTER="${CHECK_FRONTMATTER:-1}"
CHECK_LISTS="${CHECK_LISTS:-1}"
CHECK_WHITESPACE="${CHECK_WHITESPACE:-1}"
CHECK_REFS="${CHECK_REFS:-1}"
CHECK_BARE_URL="${CHECK_BARE_URL:-1}"
CHECK_EMPHASIS_HEADING="${CHECK_EMPHASIS_HEADING:-1}"
CHECK_HEADINGS="${CHECK_HEADINGS:-0}"
CHECK_TABLES="${CHECK_TABLES:-0}"

# Files with <!-- TOC --> markers whose TOC should be verified. Space-separated.
# Leave empty to skip the TOC check entirely.
TOC_FILES="${TOC_FILES:-}"

# Changelog to lint against Keep-a-Changelog. Auto-detects a repo-root CHANGELOG.md
# (case-insensitive) when unset; set to a path to point elsewhere, or empty to skip.
if [ -z "${CHANGELOG_FILE+set}" ]; then
  CHANGELOG_FILE="$(git ls-files | grep -iE '(^|/)CHANGELOG\.(md|markdown)$' | head -n1 || true)"
fi

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
run_check "$CHECK_LINK_TEXT"   "link text (link-text-lint)"     link-text-lint.js
run_check "$CHECK_FRONTMATTER" "frontmatter (frontmatter-lint)" frontmatter-lint.js --allow-missing
run_check "$CHECK_LISTS"       "lists (list-lint)"             list-lint.js
run_check "$CHECK_WHITESPACE"  "whitespace (whitespace-lint)"  whitespace-lint.js
run_check "$CHECK_REFS"        "reference links (reference-link-lint)" reference-link-lint.js
run_check "$CHECK_BARE_URL"    "bare URLs (bare-url-lint)"      bare-url-lint.js
run_check "$CHECK_EMPHASIS_HEADING" "emphasis-as-heading (emphasis-heading-lint)" emphasis-heading-lint.js
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

# Changelog structure check (single file, not the whole md set — a CHANGELOG has a
# shape no other Markdown file does, so it can't ride the run_check loop).
if [ -n "$CHANGELOG_FILE" ] && [ -f "$CHANGELOG_FILE" ]; then
  echo "→ changelog (changelog-lint)"
  if ! node "$SCRIPTS_DIR/changelog-lint.js" "$CHANGELOG_FILE"; then
    fail=1
  fi
fi

if [ "$fail" -ne 0 ]; then
  echo "✗ Docs checks failed."
  exit 1
fi

echo "✓ All docs checks passed."
