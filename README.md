# 🛠️ Helpful GitHub Scripts

A curated collection of highly robust, custom-built Node/Python automation scripts to supercharge your GitHub Profile, automate multiple Projects boards management, dynamic README synchronization, and open-source contribution logs tracking.

---

## 📋 Table of Contents
1. [auto-classify-projects.js](#1-auto-classify-projectsjs)
2. [sync-profile-readme.js](#2-sync-profile-readmejs)
3. [oss-contributor-log.py](#3-oss-contributor-logpy)
4. [markdown-toc.js](#4-markdown-tocjs)
5. [link-check.js](#5-link-checkjs)
6. [frontmatter-lint.js](#6-frontmatter-lintjs)
7. [heading-lint.js](#7-heading-lintjs)
8. [table-fmt.js](#8-table-fmtjs)
9. [code-fence-lint.js](#9-code-fence-lintjs)
10. [image-alt-lint.js](#10-image-alt-lintjs)
11. [list-lint.js](#11-list-lintjs)

---

## 1. `auto-classify-projects.js`
> **Automate and populate 7 dedicated, categorized custom boards on your GitHub Profile Projects tab.**

This script interfaces directly with the GitHub CLI (`gh`) and the GitHub GraphQL API to programmatically list, create, and organize repositories across **7 separate dedicated project boards** (AI Security, Gen AI, Traditional ML, Biocomputing, Open Source, College Projects, and Enterprise Stealth).

### ⚡ Key Features:
* **Dynamic Board Provisioning**: Checks your profile and automatically provisions any missing boards from the 7 target categories.
* **Auto-Classification Engine**: Implements a heuristics-driven classifier using repository names, descriptions, and fork flags to map any repository instantly.
* **Zero Duplication**: Queries existing items on each board, skipping populated repos and keeping existing configs safe.
* **Progress Tracking**: Sets default and active statuses (`Done` / `In Progress`) for all cards.

### 🚀 Usage:
```bash
# Grant project permissions if needed
gh auth refresh -s project

# Execute the board creation and sync script
node auto-classify-projects.js
```

---

## 2. `sync-profile-readme.js`
> **Automatically synchronize website career milestones and repositories to your GitHub Profile README.**

This script is designed to run locally or as a daily automated GitHub Action. It parses structural TypeScript schemas from a personal portfolio website, updates your profile description/achievements dynamically, and refreshes public repo links and stars.

### ⚡ Key Features:
* **Hassle-Free Token Parsing**: Slices and resolves custom TS files into clean executable JavaScript modules to read data configurations without external dependencies.
* **Custom Description Overrides**: Contains a built-in dictionary to replace default, unstructured GitHub API descriptions with premium, highly tailored copywriting for specified repos.
* **Dynamic Stars Counting**: Automatically pulls public repo stats (e.g. stargazers count) and structures repositories dynamically between specified HTML hooks without touching hand-crafted sections.

### 🚀 Usage:
```bash
# Execute sync manually
node sync-profile-readme.js
```

---

## 3. `oss-contributor-log.py`
> **A CLI utility to track your active open-source contribution pipelines.**

A clean Python script to manage and query a standardized JSON database of open-source issues, PR links, and sandbox attempt histories.

### ⚡ Key Features:
* **Duplicate Prevention**: Quick validations to check whether an issue has already been worked on before starting.
* **Status Tracking**: Logs actions under categories like `pr_opened`, `skipped`, or `abandoned` with custom status markers (`✓`, `–`, `✗`).
* **Self-Contained DB**: Stores logs locally at `~/.oss-contributor/log.json` for lightweight system-wide querying.

### 🚀 Usage:
```bash
# Initialize tracking log
python3 oss-contributor-log.py init

# Add a contribution log entry
python3 oss-contributor-log.py add '{"repo": "garak", "issue_number": 12, "issue_title": "Fix prompt injection rule", "status": "pr_opened", "pr_url": "https://github.com/leondz/garak/pull/12"}'

# View all logged entries
python3 oss-contributor-log.py show
```

---

## 4. `markdown-toc.js`
> **Generate a GitHub-accurate table of contents from any Markdown file's headings.**

A zero-dependency Node script that reads a Markdown file, extracts its headings, and builds a table of contents with anchor links that actually resolve on GitHub. Print it to stdout, or inject it straight into the file between `<!-- TOC -->` markers.

### ⚡ Key Features:
* **GitHub-accurate slugs**: Mirrors GitHub's real anchor algorithm — punctuation stripped, spaces hyphenated without collapsing, duplicate headings disambiguated (`#getting-started`, `#getting-started-1`). The links work, not just look like they should.
* **Code-fence aware**: Skips `#` lines inside fenced code blocks (```` ``` ```` / `~~~`), so a commented shell command never sneaks into your TOC.
* **Idempotent `--write`**: Updates the block between `<!-- TOC -->` and `<!-- /TOC -->` in place. Run it on every commit — it replaces, never duplicates. No markers? It drops them in right after your H1.
* **CI-friendly `--check`**: Verifies the TOC is current without touching the file. Exit `0` (up to date), `1` (stale — run `--write`), or `2` (no markers). Drop it in a CI step or pre-commit hook so a forgotten TOC update fails the build.
* **Level control**: `--min-level` / `--max-level` to skip the H1 title and ignore deep sub-headings.
* **Zero dependencies**: Pure Node `fs`. Nothing to install.

### 🚀 Usage:
```bash
# Print a TOC to stdout (default: levels 2–4, skipping the H1 title)
node markdown-toc.js README.md

# Inject/update the TOC block inside the file
node markdown-toc.js README.md --write

# Only H2 and H3
node markdown-toc.js docs/guide.md --min-level 2 --max-level 3 --write

# CI / pre-commit: fail if the TOC is stale (exit 1), missing markers (exit 2), else pass (exit 0)
node markdown-toc.js README.md --check
```

Add `<!-- TOC -->` and `<!-- /TOC -->` where you want it, then wire `--write` into a pre-commit hook to keep it fresh automatically — or `--check` into CI so a stale TOC fails the build.

### 📦 Reusable functions:
The script also exports its internals (`slugify`, `extractHeadings`, `buildToc`, `injectToc`) so you can `require()` it in your own tooling.

---

## 5. `link-check.js`
> **Find broken local links in Markdown before they embarrass you in a README.**

A zero-dependency Node script that catches the two link failures README maintainers hit most: relative file links pointing at a path that no longer exists, and in-page `#anchor` links to a heading you renamed or deleted. It validates anchors with GitHub's real slug algorithm — the same one `markdown-toc.js` uses — so `#section` links resolve exactly the way they will on github.com.

### ⚡ Key Features:
* **Dead-file detection**: Resolves every relative `[text](path)` and `![alt](path)` against the filesystem (relative to the Markdown file itself) and flags anything missing. Handles URL-encoded paths and `file.md#fragment` forms.
* **Anchor validation**: For `#anchor` links — both same-file and `other.md#anchor` — it builds the target file's heading slugs and confirms the anchor actually exists. Also honors explicit `<a name="...">` / `id="..."` anchors.
* **No false positives from code**: Links inside fenced code blocks (```` ``` ````/`~~~`) and inline `` `code spans` `` are ignored, so a sample command never reads as a broken link.
* **Network-free by default**: External URLs (`http`, `https`, `mailto`, `tel`) are never fetched — the check is deterministic and safe for CI. Pass `--external` to list them for a manual eyeball.
* **CI / pre-commit ready**: Exit `0` (all local links resolve), `1` (broken links found), or `2` (usage error). Multiple files per run.
* **Zero dependencies**: Pure Node `fs` + `path`.

### 🚀 Usage:
```bash
# Check one file
node link-check.js README.md

# Check several at once
node link-check.js README.md docs/*.md

# Also list external URLs (never fetched, just printed)
node link-check.js README.md --external

# Machine-readable report
node link-check.js README.md --json

# CI: fail the build on any broken link
node link-check.js README.md docs/guide.md
```

Pairs naturally with `markdown-toc.js`: generate the TOC, then verify every link in it (and everywhere else) still resolves. Wire both into a pre-commit hook and your docs stop rotting.

### 📦 Reusable functions:
Exports `slugify`, `cleanText`, `parseMarkdown`, `classify`, and `checkFile` for use in your own tooling via `require()`.

---

## 6. `frontmatter-lint.js`
> **Catch broken YAML frontmatter before it breaks your site build or your content tracker.**

A zero-dependency Node script that lints the `---` frontmatter block at the top of Markdown files. It's the third leg of the docs-quality set (`link-check.js` for links, `markdown-toc.js` for the TOC, this for metadata) — built for content repos where a typo'd `date` or a `tags` field that's secretly a string silently breaks a static-site build or a posting pipeline.

### ⚡ Key Features:
* **Required-key checks**: Flags missing or empty keys (default `title,date`, configurable via `--require`). An empty `title: ""` fails too, not just an absent one.
* **Type validation**: `--date-keys` must be a real `YYYY-MM-DD` calendar date (rejects `2026-13-45`); `--bool-keys` must be a true boolean (catches the classic `draft: "true"` string); `--list` keys must be an actual array (catches `tags: ai, llm` that should be `[ai, llm]`).
* **Practical YAML subset**: Parses scalars, quoted strings, flow lists (`[a, b]`), block lists (`- item`), booleans, numbers, and dates. Duplicate keys, unterminated blocks, and unsupported nested maps are reported instead of silently mis-parsed.
* **Whole-tree mode**: `--dir <path>` recursively lints every `.md`/`.markdown` file (skips `.git`/`node_modules`). `--allow-missing` lets files without frontmatter pass.
* **CI / pre-commit ready**: Exit `0` (all clean), `1` (lint problems), or `2` (usage/IO error). `--json` for machine-readable output, `--quiet` to print only failures.
* **Zero dependencies**: Pure Node `fs` + `path`. Network-free and deterministic.

### 🚀 Usage:
```bash
# Lint one post
node frontmatter-lint.js post.md

# Lint a whole content directory with a custom required set
node frontmatter-lint.js --dir blog --require title,date,tags,draft

# Treat tags AND categories as lists; draft AND featured as booleans
node frontmatter-lint.js post.md --list tags,categories --bool-keys draft,featured

# CI: fail the build on any frontmatter problem
node frontmatter-lint.js --dir content --require title,date --allow-missing
```

### 📦 Reusable functions:
Exports `extractFrontmatter`, `parseFrontmatter`, `coerceScalar`, `isValidIsoDate`, and `lintFile` for use in your own tooling via `require()`.

---

## 7. `heading-lint.js`
> **Catch the heading-structure bugs that silently break your README's anchors and table of contents.**

A zero-dependency Node script that lints the heading *structure* of Markdown files. It's the upstream companion to `link-check.js`: link-check tells you a `#anchor` is broken; heading-lint tells you **why** — almost always a duplicate heading or a skipped level. It uses the **same** GitHub slug algorithm and the **same** code-fence skipping as `markdown-toc.js` and `link-check.js`, so its idea of a "duplicate anchor" matches exactly what GitHub (and those tools) compute.

### ⚡ Key Features:
* **Duplicate-slug detection**: Two headings that resolve to the same GitHub anchor (e.g. two `## Setup`s). GitHub silently renames the second to `setup-1`, so a `[link](#setup)` lands on the wrong heading — the #1 cause of "the link looks right but jumps to the wrong place."
* **Skipped-level detection**: Flags outline jumps like H2 → H4 (skipping H3) that break the document structure and most TOC generators.
* **H1 hygiene**: Flags multiple H1s (`--allow-multiple-h1` to disable) and missing H1 (`--no-require-h1` to disable). `--require-h1` additionally requires the *first* heading to be the H1.
* **Empty-heading detection**: Catches a bare marker (`## `) with no text.
* **CI / pre-commit ready**: Exit `0` (clean), `1` (problems), `2` (usage/IO error). `--json` for machine-readable output, `--quiet` to print only failures.
* **Zero dependencies**: Pure Node `fs`. Network-free and deterministic.

### 🚀 Usage:
```bash
# Lint one file
node heading-lint.js README.md

# Lint several, machine-readable
node heading-lint.js README.md docs/*.md --json

# A partial/included doc that legitimately has no top-level H1
node heading-lint.js CHANGELOG.md --no-require-h1

# CI: fail the build on any heading problem
node heading-lint.js README.md
```

### 🐕 Dogfood note (honest output):
Run it on *this* README and it reports the repeated `⚡ Key Features:` / `🚀 Usage:` / `📦 Reusable functions:` subsection labels as `duplicate-slug`. That's the tool working correctly — those headings really do collide into the same anchors. They're harmless *here* only because the Table of Contents links to the numbered section titles (`#1-auto-classify-projectsjs`), never the bare labels. The moment anyone writes `[see usage](#-usage)`, it would resolve to the first one. The lesson the tool is teaching: decorative repeated headings are a latent anchor bug — make subsection headings unique if anything links to them.

### 📦 Reusable functions:
Exports `slugify`, `cleanText`, `extractHeadings`, and `lintHeadings` for use in your own tooling via `require()`.

---

## 8. `table-fmt.js`
> **`gofmt` for your Markdown tables — align every column so the raw source is readable and diffs stay clean.**

A zero-dependency Node script that reformats GitHub-Flavored Markdown tables: it pads every column to an even width and rewrites the delimiter row to honor each column's alignment. The rendered HTML is unchanged — this only fixes the source whitespace, the single most tedious thing to maintain by hand after you edit a cell. It's the formatting companion to the lint family above: those tell you something is wrong; this one quietly fixes it.

### ⚡ Key Features:
* **Column alignment**: Pads each column to its widest cell (min width 3) and justifies body cells **left** (`:---`), **right** (`---:`), **center** (`:--:`), or default per the delimiter row.
* **Ragged-row repair**: Pads short rows with empty cells and drops extras to the header's column count — exactly how GitHub renders a ragged table.
* **Code-fence aware**: Tables inside fenced blocks (```` ``` ```` / `~~~`) are left untouched, using the same fence-skipping as the other scripts here.
* **Idempotent**: Formatting twice produces byte-identical output — safe to run in a loop or a hook.
* **CI / pre-commit ready**: `--check` exits `1` if any file isn't already formatted; `--write` fixes in place; `--json` for machine-readable reports. Reads stdin with `-`.
* **Zero dependencies**: Pure Node `fs`. Network-free and deterministic.

### 🚀 Usage:
```bash
# Print a formatted copy to stdout
node table-fmt.js README.md

# Rewrite files in place
node table-fmt.js README.md docs/*.md --write

# CI: fail if any table isn't aligned
node table-fmt.js *.md --check

# Pipe through it
cat doc.md | node table-fmt.js -
```

### ⚠️ Honest limitation:
Column width is measured in Unicode **code points**, not terminal display columns. Wide CJK characters and emoji take two cells in a monospace editor, so a table full of them can look slightly off even when the tool considers it aligned. ASCII tables — the common case — align exactly.

### 📦 Reusable functions:
Exports `splitCells`, `isDelimiterRow`, `alignmentOf`, `formatTables`, and `formatOneTable` for use in your own tooling via `require()`.

---

## 9. `code-fence-lint.js`
> **Catch the unclosed code fence that silently turns the rest of your README into one grey blob.**

A zero-dependency Node script that lints fenced code blocks in Markdown. Its headline catch is the **unclosed fence** — a ```` ``` ```` that opens but never closes, swallowing everything after it into a single code block on GitHub. It tracks fences the same way the rest of the lint family does, but goes deeper: it understands fence *length* and *character*, so a ```` ```` ```` (4-backtick) block legitimately containing ```` ``` ```` lines, and a ```` ``` ```` block containing `~~~` lines, are parsed correctly instead of false-flagged.

### ⚡ Key Features:
* **Unclosed-fence detection**: Flags any fence that opens but never closes before end of file — the #1 cause of "why is half my README a code block?" Always an error (exit `1`).
* **Length & character aware**: A closing fence must use the **same** character (`` ` `` or `~`) and be **at least as long** as the opener. This makes longer outer fences (```` ```` ````) that wrap shorter inner fences (```` ``` ````) work, and catches the mismatched case where the only candidate closer was too short to actually close the block.
* **Missing-language warnings**: An opening fence with no language tag (```` ``` ```` vs ```` ```js ````) is reported as a **warning** (no syntax highlighting). Promote it to an error with `--strict-language`, or silence it entirely with `--no-require-language`.
* **Tildes too**: `~~~` fences are handled exactly like backtick fences, including the cross-character rule (a `~~~` line inside a ```` ``` ```` block is content, not a close).
* **No false positives from inline code**: Only a line that *starts* (after ≤3 spaces, CommonMark-style) with a fence run counts — inline `` `code` `` is never mistaken for a fence. Fences inside list items work.
* **CI / pre-commit ready**: Exit `0` (clean — warnings alone don't fail), `1` (errors), or `2` (usage/IO error). `--json` for machine-readable output, `--quiet` to print only failures.
* **Zero dependencies**: Pure Node `fs`. Network-free and deterministic.

### 🚀 Usage:
```bash
# Lint one file
node code-fence-lint.js README.md

# Lint several, machine-readable
node code-fence-lint.js README.md docs/*.md --json

# Make a missing language tag fail the build, not just warn
node code-fence-lint.js README.md --strict-language

# Don't care about language tags — only catch unclosed fences
node code-fence-lint.js README.md --no-require-language

# CI: fail the build on any unclosed/mismatched fence
node code-fence-lint.js README.md
```

### ⚠️ Honest limitation:
There's no full CommonMark block parser. A ```` ``` ```` that lives inside an *indented* (4-space) code block or an unusually-nested blockquote may be read as a real fence. The common cases — top-level fences and fences inside list items — are handled correctly.

### 📦 Reusable functions:
Exports `matchFence` and `lintFences` for use in your own tooling via `require()`.

---

## 10. `image-alt-lint.js`
> **The README picture that says nothing to a screen reader — or to Google Image search.**

A zero-dependency Node script that lints **image alt text** in Markdown and inline HTML — the accessibility (and SEO) gap that no link checker or heading linter catches. `![](diagram.png)` renders a picture for sighted readers and *silence* for everyone using a screen reader; this finds those before they ship. It's the a11y companion to `link-check.js`: link-check tells you an image URL is dead, this tells you a *live* image has no usable description.

### ⚡ Key Features:
* **Missing & empty alt (errors)**: Flags `![](src)`, `![   ](src)` (whitespace-only), and `<img src=...>` with **no `alt` attribute at all** — the hard accessibility failures. Exit `1`.
* **Weak alt (warnings)**: Catches alt text that's just a **filename** (`![diagram.png](diagram.png)`) or **placeholder boilerplate** (`image`, `photo`, `screenshot here`, `alt text`, `TODO`…). Promote warnings to errors with `--strict`.
* **Markdown *and* HTML**: Handles `![alt](src)`, reference-style `![alt][ref]`, and `<img>` tags (single/double/bare-quoted attributes) — READMEs use all three.
* **Knows decorative from broken**: A `<img>` with `role="presentation"`, `role="none"`, or `aria-hidden="true"` is skipped. With `--allow-empty`, an *explicitly* empty alt (`![]()` / `alt=""`, the WCAG decorative pattern) passes — but a totally **missing** `<img>` alt attribute still fails, because that's the real bug.
* **No false positives**: Skips fenced code blocks (```` ``` ````/`~~~`) and inline `` `code` `` spans the same way the rest of the lint family does, so an image written *as an example* never trips it. Per-line opt-out with a trailing `<!-- alt-lint-ignore -->`.
* **CI / pre-commit ready**: Exit `0` (no errors — warnings alone don't fail unless `--strict`), `1` (errors), or `2` (usage/IO error). `--json` for machine-readable output, `--quiet` to print only failures.
* **Zero dependencies**: Pure Node `fs`. Network-free and deterministic.

### 🚀 Usage:
```bash
# Lint one file
node image-alt-lint.js README.md

# Lint several, machine-readable
node image-alt-lint.js README.md docs/*.md --json

# Make weak alt text (filenames, placeholders) fail the build too
node image-alt-lint.js README.md --strict

# Treat explicit empty alt as decorative-ok (still fails a missing <img> alt)
node image-alt-lint.js README.md --allow-empty

# Only Markdown images, ignore <img> tags
node image-alt-lint.js README.md --no-html
```

### ⚠️ Honest limitation:
Images are matched per line, so a `<img>` tag split across multiple lines isn't fully parsed. The common cases — Markdown images and single-line `<img>` tags — are handled. Alt text containing a literal `]` can confuse the Markdown matcher (rare in practice).

### 📦 Reusable functions:
Exports `lintImages`, `classifyAlt`, `htmlAttr`, `basename`, and `stripInlineCode` for use in your own tooling via `require()`.

---

## 11. `list-lint.js`
> **The bullet you switched from `-` to `*` mid-list, and the ordered list that jumps `1, 2, 4`.**

A zero-dependency Node script that lints **Markdown list consistency** — the churn-and-render problems the other linters don't look at. Mixed bullet markers and a broken number sequence render *fine* on GitHub, so nobody notices until a formatter rewrites every marker and a one-line change shows up as a 40-line diff. This catches it first. It's the list-focused sibling of `code-fence-lint.js` and `table-fmt.js`: same fence-skipping, same CLI, same CI exit codes.

### ⚡ Key Features:
* **`inconsistent-bullet` (error)**: Within a single list, flags an unordered item whose marker (`-` / `*` / `+`) differs from the first one used at that level. Scoped to *one list block* — a repo that uses `-` in one section and `*` in another is never penalized; only mixing **within** a list is. (markdownlint MD004.)
* **`ordered-numbering` (error)**: Flags an ordered list that's neither clean lazy numbering (all `1.`, which GitHub renumbers for you) nor a real incrementing run from its start. `1, 2, 4` or `1, 3, 2` is the hand-edit that dropped or duplicated a step. (MD029.)
* **`odd-indent` (warning)**: Flags a list item indented by an **odd** number of spaces (1, 3, 5…) — the typo that can silently flip a nested item into a sibling or a stray paragraph. Promote with `--strict-indent`, silence with `--no-indent`. (Related to MD005/MD007.)
* **No false positives**: Tracks fenced code blocks (```` ``` ````/`~~~`) and skips them, so a `-` in a code sample is never a bullet. Loose lists (blank lines between items) and lists separated by prose are handled correctly.
* **CI / pre-commit ready**: Exit `0` (no errors — warnings alone don't fail), `1` (errors), `2` (usage/IO). `--json` for machine output, `--quiet` to print only failures. Each rule individually toggleable.
* **Zero dependencies**: Pure Node `fs`. Network-free and deterministic.

### 🚀 Usage:
```bash
# Lint one file
node list-lint.js README.md

# Lint several, machine-readable
node list-lint.js docs/*.md --json

# Make an odd indent fail the build too
node list-lint.js README.md --strict-indent

# Turn individual rules off
node list-lint.js README.md --no-indent --no-ordered
```

### ⚠️ Honest limitation:
No full CommonMark list parser — marker consistency and numbering are keyed by leading-space width, which is the common case; exotic nesting inside blockquotes or 4-space indented code may be read loosely. Ordered "start" is taken from the first item, so a list that deliberately starts at 5 and increments is accepted.

### 📦 Reusable functions:
Exports `lintText` for use in your own tooling via `require()`.

---

## 🔁 Wire the docs checks into CI / pre-commit

The linters are most useful when they run automatically — so docs rot fails a build instead of
sitting unnoticed. `examples/check-docs.sh` wires **all eight** into one command; the
[`examples/`](examples/) folder has copy-paste artifacts to drop it into CI or a git hook:

| File | What it is | How to use |
|------|-----------|-----------|
| [`examples/check-docs.sh`](examples/check-docs.sh) | One command that runs the whole suite over every tracked Markdown file — links, code fences, image alt text, and frontmatter by default; heading structure, table alignment, and marker-based TOCs opt-in. Exit `0`/`1`. | `bash examples/check-docs.sh` |
| [`examples/docs-check.yml`](examples/docs-check.yml) | GitHub Actions workflow — runs the checks on every push/PR that touches Markdown. | Copy to `.github/workflows/docs-check.yml` |
| [`examples/git-pre-commit`](examples/git-pre-commit) | Pre-commit hook — blocks a commit that introduces a broken link (checks only staged Markdown). | `cp examples/git-pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit` |

```bash
# Try it right now, on this repo:
bash examples/check-docs.sh
# → Linting N Markdown file(s)…
# ✓ All docs checks passed.
```

**Five checks run by default** — `link-check`, `code-fence-lint`, `image-alt-lint`,
`frontmatter-lint` (`--allow-missing`, so plain docs pass and only files that *have* frontmatter
get validated), and `list-lint`. These fail only on genuine defects: a dead link, an unclosed
fence, a missing `alt`, malformed frontmatter, or a list that mixes bullet markers / botches its
numbering (`list-lint`'s odd-indent check is a non-failing warning).

**Two checks are opt-in** — `heading-lint` and `table-fmt --check` — because they can flag
deliberate style (repeated sub-headings across sections, hand-aligned tables), not bugs. Turn them
on for a strict pass:

```bash
CHECK_HEADINGS=1 CHECK_TABLES=1 bash examples/check-docs.sh
```

Every check is individually toggleable (`1` = run, `0` = skip):
`CHECK_LINKS`, `CHECK_FENCES`, `CHECK_ALT`, `CHECK_FRONTMATTER`, `CHECK_LISTS`, `CHECK_HEADINGS`, `CHECK_TABLES`.
For example, `CHECK_ALT=0 bash examples/check-docs.sh` skips the alt-text check.

To also verify a marker-based table of contents, list the files that use `<!-- TOC -->` markers:

```bash
TOC_FILES="README.md docs/guide.md" bash examples/check-docs.sh
```

> **Note:** the TOC check is opt-in per file because `markdown-toc.js --check` keys off the literal
> `<!-- TOC -->` markers — a doc that only *mentions* those strings in prose (like this README) would
> read as having a TOC it doesn't. The default checks have no such caveat and run on everything.

---

## 📜 License
MIT — Do whatever you want with these scripts!
