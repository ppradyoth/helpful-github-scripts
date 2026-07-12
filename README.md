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
12. [commit-lint.js](#12-commit-lintjs)
13. [changelog-lint.js](#13-changelog-lintjs)
14. [whitespace-lint.js](#14-whitespace-lintjs)
15. [link-text-lint.js](#15-link-text-lintjs)
16. [secret-scan.js](#16-secret-scanjs)
17. [reference-link-lint.js](#17-reference-link-lintjs)
18. [bare-url-lint.js](#18-bare-url-lintjs)
19. [emphasis-heading-lint.js](#19-emphasis-heading-lintjs)
20. [atx-heading-space-lint.js](#20-atx-heading-space-lintjs)

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

## 12. `commit-lint.js`
> **The `Fixed stuff.` commit that quietly drops out of your changelog.**

A zero-dependency Node script that lints **git commit messages** against [Conventional Commits](https://www.conventionalcommits.org/) — the format `semantic-release`, changelog generators, and auto-versioning tools depend on. The other scripts here lint *files*; this one lints *history*. A single `Feat:` (wrong case) or `feature:` (wrong word) silently falls out of the generated changelog and breaks the next version bump — this catches it at commit time, before it's baked into `main`.

### ⚡ Key Features:
* **`header-format` (error)**: The first line must parse as `type(scope)?!?: description`. No colon, an empty description, or a body glued to the header without a blank line is flagged — the structural problems that make a message un-parseable.
* **`type` (error)**: The type must be lowercase and one of `feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert`. `Feat` and `feature` are both flagged. Override the set with `--types feat,fix,docs`.
* **`blank-line` (error)**: A body must be separated from the header by exactly one blank line (line 2), or `git log` and every parser misreads it as one long subject.
* **`subject-length` (warning)**: Header over `--max-subject` (default 72) chars — the length that truncates in `git log --oneline`, GitHub, and email.
* **`subject-style` (warning)**: Description ending in a period or starting with a capital letter (the commitlint "imperative, lowercase" house style). Acronyms like `API` are **not** flagged. Silence with `--no-style`.
* **Breaking changes accepted, never flagged**: both `feat!: …` and a `BREAKING CHANGE:` footer are recognized.
* **Hook-ready**: point it straight at `.git/COMMIT_EDITMSG` from a `commit-msg` hook — it strips git's `#` comment lines and the verbose-commit scissors (`# ------ >8 ------`) diff section first. Git-generated `Merge`/`Revert` messages are skipped by default (`--lint-merges` to check them).
* **Three input modes**: message files (`node commit-lint.js .git/COMMIT_EDITMSG`), `--stdin`, or a whole range (`--range origin/main..HEAD`) to lint every commit in a PR.
* **CI-ready**: exit `0` (no errors — warnings alone don't fail), `1` (errors), `2` (usage/IO/git). `--json` for machine output, `--quiet` to print only failures.
* **Zero dependencies**: pure Node `fs` + `git` for the `--range` mode. Network-free.

### 🚀 Usage:
```bash
# As a commit-msg hook (.git/hooks/commit-msg):
#   #!/bin/sh
#   exec node path/to/commit-lint.js "$1"

# Lint a single message file
node commit-lint.js .git/COMMIT_EDITMSG

# Lint every commit in a PR before you push
node commit-lint.js --range origin/main..HEAD

# Pipe a message in
echo "feat: add token refresh" | node commit-lint.js --stdin

# Stricter subject cap, only allow two types
node commit-lint.js --range HEAD~10..HEAD --max-subject 50 --types feat,fix
```

### 🐕 Dogfood note (honest output):
This repo's own history predates the convention (commits like `Add list-lint.js: …`), so `node commit-lint.js --range HEAD~5..HEAD` flags them as malformed headers. That's the script working correctly — not a bug. History isn't rewritten here; the linter is meant to gate *new* commits going forward, which is exactly how you'd adopt it on a real project.

### ⚠️ Honest limitation:
Not a full `commitlint`. It checks header grammar, type, structure, and length hygiene — not a scope enum, footer/issue-reference syntax, or the semver implication of a type. That covers where most bad commits actually go wrong; reach for `commitlint` if you need the config-driven rule engine.

### 📦 Reusable functions:
Exports `lintMessage(message, opts)` and `stripGitCruft(raw)` for use in your own tooling via `require()`.

---

## 13. `changelog-lint.js`
> **The `## v1.2.0` heading that your release tooling silently skips.**

A zero-dependency Node script that lints a `CHANGELOG.md` against the [Keep a Changelog](https://keepachangelog.com/) convention. `commit-lint.js` lints *history* and the rest lint *any* Markdown; this one lints the **one file** release automation actually parses. A version heading written `## v1.2.0` instead of `## [1.2.0] - 2025-06-01`, or a change group typo'd `### Fixes` instead of `### Fixed`, drops that section out of every parser that reads it — GitHub Release notes, `semantic-release`, changelog aggregators. This catches it before you tag.

### ⚡ Key Features:
* **`version-format` (error)**: A release heading must be `## [x.y.z] - YYYY-MM-DD` (or `## [Unreleased]`). Catches `## 1.2.0`, `## [1.2.0]` with no date, `## v1.2.0 - …`, missing brackets. An optional trailing ` [YANKED]` is allowed.
* **`invalid-version` (error)**: The bracketed version must be valid [SemVer](https://semver.org/) — `[1.2]`, `[1.2.0.0]`, and `[01.2.0]` are flagged (official SemVer 2.0.0 grammar, pre-release and build metadata supported).
* **`invalid-date` (error)**: The date must be a real ISO `YYYY-MM-DD` calendar date — `2025-13-40` and `2025-02-30` are rejected, not just regex-matched.
* **`bad-change-type` (error)**: An `###` group under a version must be one of the six Keep a Changelog sections — `Added, Changed, Deprecated, Removed, Fixed, Security`. `### Fixes`, `### New`, `### Notes` are the classic drift.
* **`duplicate-version` (error)**: The same version number in two headings — the copy-paste-a-section-and-forget-to-bump mistake.
* **`no-unreleased` (warning)**: No `## [Unreleased]` section — the recommended landing spot for the next change.
* **`version-order` (warning)**: Releases not listed newest-first by SemVer precedence, or `[Unreleased]` not on top.
* **`empty-section` (warning)**: A version or change group with no entries beneath it (a version whose only content is its `###` groups is *not* flagged).
* **Fenced code aware**: a `## 9.9.9` inside a ` ``` ` block is a sample, not a heading — never flagged.
* **CI-ready**: exit `0` (no errors — warnings alone don't fail), `1` (errors), `2` (usage/IO). `--json`, `--quiet`, `--strict` (promote warnings to errors), and a `--no-<rule>` flag per rule.
* **Zero dependencies**: pure Node `fs`. Network-free.

### 🚀 Usage:
```bash
# Lint the changelog
node changelog-lint.js CHANGELOG.md

# Machine-readable, or fail on warnings too
node changelog-lint.js CHANGELOG.md --json
node changelog-lint.js CHANGELOG.md --strict

# Turn off the "newest first" and "needs Unreleased" opinions
node changelog-lint.js CHANGELOG.md --no-order --no-unreleased
```

### ⚠️ Honest limitation:
It checks **structure**, not prose — it won't tell you an entry is badly written or that a shipped change went unlogged. It also skips the bottom link-reference definitions (`[1.2.0]: …/compare/…`); that's `link-check.js`'s job. It validates the skeleton every tool relies on, and leaves the writing to you.

### 📦 Reusable functions:
Exports `lintText(text, opts)`, plus `parseSemver`, `compareSemver`, and `isValidDate` for use in your own tooling via `require()`.

---

## 14. `whitespace-lint.js`
> **The invisible diff noise every other linter ignores — and the one that can safely fix itself.**

A zero-dependency Node script that lints (and repairs) whitespace *hygiene* in any text file. The rest of the family checks what a document **says**; this one checks the invisible bytes around it — trailing spaces, hard tabs, CRLF line endings, a missing final newline, runs of blank lines. None of them change the rendered output; all of them create diff churn, merge conflicts, and "why did my whole file change?" pull requests. Because every rule is mechanical, `--fix` can repair all of them safely and idempotently.

### ⚡ Key Features:
* **`trailing-whitespace` (error, MD009)**: A line ends in spaces/tabs. Exception: exactly **two** trailing spaces is a Markdown hard line break — allowed by default, forbid it with `--no-md-breaks`.
* **`hard-tab` (error, MD010)**: A tab used for indentation *outside* a fenced code block (tabs render at an unpredictable width and misalign nested lists). Tabs **inside** code fences are left alone — often significant, e.g. a pasted Makefile — unless you pass `--tabs-in-code`.
* **`crlf` (error)**: A line ends in `\r\n` or a bare `\r`. Windows checkouts sneak these in and make every line look changed on a Unix diff.
* **`final-newline` (error)**: The file doesn't end with exactly one newline — covers both "no newline at end of file" (GitHub's telltale marker) and "extra blank lines at EOF."
* **`multiple-blanks` (warning, MD012)**: More than N consecutive blank lines (`--max-blanks N`, default 1). Warning by default; promote with `--strict-blanks`.
* **`--fix`**: Repairs every enabled rule in place — strips trailing space, expands indent tabs to spaces, normalizes to LF, collapses blank runs, and lands exactly one final newline. **Idempotent**: running it twice changes nothing the second time.
* **Fenced code aware**: the hard-tab and blank-run rules skip ` ``` `/`~~~` blocks by default (code has its own whitespace rules); trailing-whitespace, CRLF, and final-newline are checked everywhere because they're never intentional.
* **Works on any text file**, not just Markdown — point it at `.js`, `.py`, `.yml`, whatever. The Markdown-specific logic simply won't trigger where there are no fences or hard breaks.
* **CI-ready**: exit `0` (clean, or `--fix` repaired everything), `1` (findings), `2` (usage/IO). `--json` for machine output, and a `--no-<rule>` flag per rule.
* **Zero dependencies**: pure Node `fs`. Network-free.

### 🚀 Usage:
```bash
# Lint one or many files
node whitespace-lint.js README.md
node whitespace-lint.js src/*.js docs/*.md --json

# Repair in place (safe, idempotent)
node whitespace-lint.js *.md --fix

# Tighten or loosen the opinions
node whitespace-lint.js post.md --no-md-breaks      # a 2-space break is an error too
node whitespace-lint.js post.md --max-blanks 2       # allow up to 2 blank lines
node whitespace-lint.js post.md --no-crlf --no-tab   # turn rules off
```

### ⚠️ Honest limitation:
`--fix` collapses blank-line runs globally rather than re-parsing fences during the rewrite, so a code sample that deliberately embeds three blank lines will be trimmed to your `--max-blanks` too — rare, but pass `--no-blanks` if a doc relies on it. Tab-to-space fixing uses 2 spaces per indent tab; if your project standard is 4, run your formatter after.

### 📦 Reusable functions:
Exports `lintContent(raw, opts)`, `fixContent(raw, opts)`, `parseArgs`, `detectEol`, and `fenceMarker` for use in your own tooling via `require()`.

---

## 15. `link-text-lint.js`
> **The "click here" link that says nothing to a screen reader — or to Google.**

A zero-dependency Node script that lints **link text** in Markdown and inline HTML — the accessibility (and SEO) gap that a link checker can't see. `link-check.js` tells you a URL is *dead*; this tells you a *working* link has text that says *nothing*. Screen-reader users routinely pull up a list of every link on the page and navigate by that list, out of context — a page of ten "click here" links is ten identical, meaningless entries. Search engines read link text as a relevance signal for the destination, so "here" and "read more" throw that away too. It's the link-side companion to `image-alt-lint.js`: one flags images that describe nothing to a listener, this flags links that do.

### ⚡ Key Features:
* **Empty & whitespace text (errors)**: Flags `[](url)`, `[   ](url)`, and `<a href=...></a>` with no text — a screen reader announces the raw URL or nothing. Exit `1`.
* **Non-descriptive text (warning)**: Catches the WCAG 2.4.4 classics — `click here`, `here`, `this`, `this link`, `read more`, `learn more`, `more`, `link`, `download`… — text that's meaningless away from its sentence. Promote to errors with `--strict`.
* **Raw-URL text (warning)**: Flags a link whose visible text is just a long URL (`[https://ex.com/a/b/c](https://…)`) — a listener hears the whole thing read aloud. Short bare domains (`example.com`) read fine and pass.
* **Markdown *and* HTML**: Handles `[text](url)`, reference-style `[text][ref]`, and `<a href>text</a>`. Ignores images (`![alt](src)` — that's `image-alt-lint.js`'s job) and idiomatic angle-bracket autolinks (`<https://example.com>`).
* **Unwraps formatting**: bold link text like `[**here**](https://example.com)` and code-styled text like `` [`cmd`](https://example.com) `` are normalized before checking, so emphasis and inline-code link text are judged by their rendered words — and a real code-styled link is *not* mistaken for empty.
* **No false positives**: Skips fenced code blocks and links written *inside* an inline `` `code` `` span (a literal `` `[here](x)` `` example never trips it). Per-line opt-out with a trailing `<!-- link-lint-ignore -->`.
* **CI / pre-commit ready**: Exit `0` (no errors — warnings alone don't fail unless `--strict`), `1` (errors), or `2` (usage/IO error). `--json` for machine output, `--quiet` to print only failures, `--no-html` for Markdown-only.
* **Zero dependencies**: Pure Node `fs`. Network-free and deterministic.

### 🚀 Usage:
```bash
# Lint one file
node link-text-lint.js README.md

# Lint several, machine-readable
node link-text-lint.js README.md docs/*.md --json

# Make non-descriptive / raw-URL link text fail the build too
node link-text-lint.js README.md --strict

# Only Markdown links, ignore <a> tags
node link-text-lint.js README.md --no-html
```

### ⚠️ Honest limitation:
Links are matched per line, so an `<a>` tag whose opening tag and text span multiple lines isn't fully parsed. The common cases — Markdown links and single-line `<a>` — are handled. The non-descriptive word list is English; localize the `NONDESCRIPTIVE` set for other languages.

### 📦 Reusable functions:
Exports `lintLinks`, `classifyText`, `plainText`, `normalizeText`, `htmlAttr`, and `codeSpanRanges` for use in your own tooling via `require()`.

---

## 16. `secret-scan.js`
> **The one commit you can't take back: a live credential.**

A zero-dependency Node scanner for hardcoded secrets — API keys, tokens, private keys — in your working tree. This is the *security* check the doc linters aren't: once a real key lands in git history it's public forever, and the fix is to **rotate the key, not `git rm` it**. So you catch it *before* the commit, with no install and no network call. It uses the same prefix-anchored patterns the heavyweight scanners (gitleaks, trufflehog) ship, so it recognizes real credential shapes rather than guessing.

### ⚡ Key Features:
* **Prefix-anchored, high-confidence rules (errors)**: AWS access key IDs (`AKIA…`), GitHub tokens (`ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_` and fine-grained `github_pat_`), Slack tokens (`xoxb-…`) and webhooks (`hooks.slack.com/services/…`), Google API keys (`AIza…`), Stripe secret/restricted keys (`sk_live_`/`rk_live_`), npm tokens (`npm_…`), and `-----BEGIN … PRIVATE KEY-----` blocks. These are specific enough to act on — they fail the run.
* **Lower-confidence shapes (warnings)**: JWT-shaped strings (often not secret) and generic `secret = "…"` / `api_key = "…"` assignments whose value clears an entropy bar. Advisory by default; promote to failures with `--strict`.
* **Entropy + placeholder filtering**: The generic rule computes Shannon entropy so a random token trips it but a low-entropy string doesn't. Obvious placeholders — `EXAMPLE`, `your_token_here`, `<redacted>`, `${VAR}`, `{{...}}`, repeated-char runs — are filtered out, which is why AWS's own docs value `AKIAIOSFODNN7EXAMPLE` never fires.
* **Redacted output**: Every finding shows only the first/last few characters (`ghp_…Vt6y (40 chars)`), so the scanner's own report never becomes the leak.
* **Tree-aware**: Point it at a directory and it walks the tree, skipping `.git`, `node_modules`, `vendor`, build output, binaries, and files over 2 MB (plus a NUL-byte binary sniff).
* **CI / pre-commit ready**: Exit `0` (clean), `1` (secret found — or a warning under `--strict`), `2` (usage/IO error). `--json` for machine output, `--quiet` to suppress the success line.
* **Zero dependencies**: Pure Node `fs`/`path`. Deterministic, network-free.

### 🚀 Usage:
```bash
# Scan a whole tree
node secret-scan.js .

# Scan specific files (e.g. a staged .env you didn't mean to add)
node secret-scan.js src/config.js .env

# Make JWTs and generic high-entropy assignments fail too
node secret-scan.js . --strict

# Machine-readable
node secret-scan.js . --json
```

### ⚠️ Honest limitation:
It scans the **working tree**, not git history — so it stops a secret from being *added*, but won't find one already buried in past commits (run it in a fresh clone, or over `git log -p` output, for that). Prefix-anchored rules can't catch a bespoke in-house token with no fixed shape; the entropy rule is the conservative fallback. Tune the `RULES` and entropy `THRESHOLDS` for a noisier or stricter codebase.

### 📦 Reusable functions:
Exports `RULES`, `shannonEntropy`, `redact`, `isPlaceholder`, `scanText`, `scanFile`, and `scanPaths` for use in your own tooling via `require()`.

---

## 17. `reference-link-lint.js`
> **The link that renders as literal brackets — `[see the guide][guide]` — because the definition was renamed.**

Markdown has two link syntaxes. Inline — `[text](url)` — is what `link-check.js` validates. This lints the *other* one: **reference style**, where the text and the URL are separated (`[text][guide]` in the prose, `[guide]: https://…` defined elsewhere). It keeps long docs readable, but it fails in two ways a URL checker never sees — because the bug is whether the *label* resolves, not whether the URL is reachable.

### ⚡ What it catches:
* **Undefined reference (error)** — `[text][gone]` or collapsed `[gone][]` where `[gone]:` was renamed or never written. GitHub renders this as literal text, brackets and all. (markdownlint **MD052**.) Fails the run — the link is visibly broken.
* **Unused definition (warning)** — `[old]: https://…` left behind after every `[old]` reference was deleted. Dead weight that rots silently. (markdownlint **MD053**.)
* **Duplicate definition (warning)** — the same `[label]:` defined twice. CommonMark keeps the **first** and silently ignores the rest, so the second URL you thought you set never applies.

### ✅ What it *won't* false-positive on:
* **Shortcut text that isn't a link.** A bare `[just some brackets]` with no matching definition is literal text in Markdown, not a broken link — so it's never reported as undefined. Only the explicit `[text][ref]` / `[ref][]` forms (which *declare* themselves references) can be "undefined."
* **Examples in code.** References inside ` ``` ` fences or `` `backticks` `` are skipped, so a documented snippet doesn't trip the linter.
* **A definition used only by a shortcut.** `[home]` in prose counts as using `[home]:` — it won't be flagged unused.

### 🚀 Usage:
```bash
# Check one file (or several)
node reference-link-lint.js README.md docs/*.md

# Make unused / duplicate definitions fail too (default: warnings only)
node reference-link-lint.js README.md --strict

# Machine-readable / quiet-on-success
node reference-link-lint.js README.md --json
node reference-link-lint.js README.md --quiet
```

Exit `0` (clean), `1` (an undefined reference — or any warning under `--strict`), `2` (usage/read error). Wired into `check-docs.sh` as a default-ON, defect-only check (only the undefined-reference error fails the suite; unused/duplicate stay advisory unless you pass `--strict`).

### 📦 Reusable functions:
Exports `normLabel`, `parseReferences`, and `checkFile` for use in your own tooling via `require()`.

---

## 18. `bare-url-lint.js`
> **`see https://example.com.` links to `example.com.` — the trailing dot got swallowed. A bare URL is a bug waiting for a renderer that doesn't auto-link.**

GitHub auto-links a raw URL, so `See https://example.com for details.` *renders* fine — and that's the trap. `link-check.js` tells you whether a URL resolves; this tells you it's written in a form that only works by luck. (markdownlint **MD034**.)

Three reasons a bare URL is a latent bug, none of which a link checker sees:
* **Auto-linking isn't universal.** GitHub does it; many Markdown renderers — and every plain-text reader — leave the URL as dead, unclickable text.
* **No descriptive text.** A bare URL is the exact anti-pattern [`link-text-lint.js`](#15-link-text-lintjs) catches one step downstream — `https://…` can't say what it points to.
* **Punctuation collisions.** A trailing `.` or `)` gets pulled into (or breaks) the auto-link, so `see https://example.com.` links to `example.com.` — a real, silent 404.

The fix is always local: `<https://example.com>` for a deliberate autolink, or `[text](https://example.com)` to give it words.

### ✅ What it *won't* false-positive on:
* URLs already inside a link or image — `[text](url)`, `![alt](url)`, `<url>`.
* URLs in a reference definition — `[label]: https://…` (that's [`reference-link-lint.js`](#17-reference-link-lintjs)'s job).
* URLs in raw HTML attributes — `<a href="…">`, `<img src="…">`.
* Anything inside ` ``` ` fences or `` `inline code` `` — documented example URLs don't trip it. Same fence/code-awareness as the rest of the suite.

### 🚀 Usage:
```bash
# Check one file (or several)
node bare-url-lint.js README.md docs/*.md

# Machine-readable / quiet-on-success
node bare-url-lint.js README.md --json
node bare-url-lint.js README.md --quiet
```

Exit `0` (clean), `1` (a bare URL found), `2` (usage/read error).

### 📦 Reusable functions:
Exports `lintContent` and `protectedRanges` for use in your own tooling via `require()`.

---

## 19. `emphasis-heading-lint.js`
> **`**Installation**` on its own line renders like a heading and is invisible to every tool that reads document outline — no anchor, no TOC entry, no screen-reader stop.**

A whole line of bold (or italic) standing in for a section title *looks* right and is structurally nothing. `heading-lint.js` checks your real `#` headings; this catches the fake ones it can't see. (markdownlint **MD036**.)

Three reasons a bold-line-as-heading is a latent bug:
* **Invisible to structure.** It produces no `#`, so `markdown-toc.js` and `heading-lint.js` never see it, it gets no anchor, and nothing can link to it — to every outline tool, that section doesn't exist.
* **Breaks accessibility.** Screen readers navigate by real headings; a bold paragraph is announced as ordinary text, so the section becomes un-navigable.
* **Loses the level.** A real `##`/`###` carries depth; bold carries none, so the nesting the author meant is gone.

The fix is almost always to promote it: `**Installation**` → `### Installation`, at whatever level fits the outline.

### ✅ What it *won't* false-positive on:
* Emphasis that's only *part* of a line — `This is **important** context`.
* Emphasis ending in sentence punctuation — `**Warning!**`, `*See below:*` — that's an emphasized sentence, not a heading (set configurable via `--punctuation`).
* Bold inside list items, blockquotes, or table rows — `- **Label:** …`, `> **Note**`, `| **cell** |`.
* Anything inside ` ``` ` fenced code blocks. Same fence-awareness as the rest of the suite.

### 🚀 Usage:
```bash
# Check one file (or several)
node emphasis-heading-lint.js README.md docs/*.md

# Machine-readable / quiet-on-success
node emphasis-heading-lint.js README.md --json
node emphasis-heading-lint.js README.md --quiet

# Flag whole-line emphasis regardless of trailing punctuation
node emphasis-heading-lint.js README.md --punctuation ""
```

Exit `0` (clean), `1` (a fake heading found), `2` (usage/read error).

### 📦 Reusable functions:
Exports `lintContent` and `wholeLineEmphasis` for use in your own tooling via `require()`.

---

## 20. `atx-heading-space-lint.js`
> **`##Setup` with no space after the hashes is not a heading — CommonMark renders it as literal text, so it gets no anchor, no TOC entry, and no screen-reader stop.**

This is the mirror image of section 19: there, something that *isn't* a heading renders like one; here, something you *meant* as a heading silently renders as body text — because you forgot the space. CommonMark (and GitHub) require a space between the `#` run and the title. `heading-lint.js` and `markdown-toc.js` never see the botched one, because to them it isn't a heading at all. (markdownlint **MD018**; the cosmetic multiple-spaces case is **MD019**.)

Two rules, both about the space after the opening `#`s:
* **`##Setup`** → **MD018**, the real bug: renders as text, not a heading. Flagged as an error.
* **`##&nbsp;&nbsp;Setup`** → **MD019**, cosmetic: still a heading, but the extra spaces are diff noise. On by default; silence with `--no-multiple-space` to check only the MD018 bug.

### ✅ What it *won't* false-positive on:
* Correctly-spaced headings (`## Setup`) and bare/empty ones (`##`, `###&nbsp;&nbsp;&nbsp;`).
* Lines with 7+ hashes (`#######…`) — not a heading in CommonMark — and anything indented 4+ spaces (an indented code block).
* A `#` in the *middle* of prose (`priced at #1`) — only line-opening hashes are heading candidates.
* Anything inside ` ``` ` / ` ~~~ ` fenced blocks, so a `#define` or a `#!/bin/sh` shebang in an example is left alone. Same fence-awareness as the rest of the suite.

**Heuristic caveat** (identical to markdownlint MD018): a non-heading prose line that genuinely opens with a hash — `#1 priority`, a bare `#hashtag` — *is* flagged, because it's indistinguishable from a botched heading and renders as literal text either way. Escape it (`\#1`) or fence it if you mean a literal hash; add the space if you mean a heading. Closed ATX (`## Setup ##`, MD020/MD021) is intentionally out of scope — it's rare, and a half-right detector is worse than none.

### 🚀 Usage:
```bash
# Check one file (or several)
node atx-heading-space-lint.js README.md docs/*.md

# Machine-readable / quiet-on-success
node atx-heading-space-lint.js README.md --json
node atx-heading-space-lint.js README.md --quiet

# Only the real bug (MD018), skip the cosmetic multiple-spaces rule
node atx-heading-space-lint.js README.md --no-multiple-space
```

Exit `0` (clean), `1` (a spacing problem found), `2` (usage/read error).

### 📦 Reusable functions:
Exports `lintContent` and `classifyLine` for use in your own tooling via `require()`.

---

## 🔁 Wire the docs checks into CI / pre-commit

The linters are most useful when they run automatically — so docs rot fails a build instead of
sitting unnoticed. `examples/check-docs.sh` wires **the whole suite** into one command; the
[`examples/`](examples/) folder has copy-paste artifacts to drop it into CI or a git hook:

| File | What it is | How to use |
|------|-----------|-----------|
| [`examples/check-docs.sh`](examples/check-docs.sh) | One command that runs the whole suite over every tracked Markdown file — links, code fences, image alt text, and frontmatter by default; heading structure, table alignment, and marker-based TOCs opt-in. Exit `0`/`1`. | `bash examples/check-docs.sh` |
| [`examples/docs-check.yml`](examples/docs-check.yml) | GitHub Actions workflow — runs the checks on every push/PR that touches Markdown. | Copy to `.github/workflows/docs-check.yml` |
| [`examples/git-pre-commit`](examples/git-pre-commit) | Pre-commit hook — blocks a commit that introduces a broken link (checks only staged Markdown). | `cp examples/git-pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit` |
| [`examples/git-pre-commit-secrets`](examples/git-pre-commit-secrets) | Pre-commit hook — blocks a commit that adds a hardcoded secret (scans only staged files with `secret-scan.js`). | `cp examples/git-pre-commit-secrets .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit` |

```bash
# Try it right now, on this repo:
bash examples/check-docs.sh
# → Linting N Markdown file(s)…
# ✓ All docs checks passed.
```

**Eleven checks run by default** — `link-check`, `code-fence-lint`, `image-alt-lint`,
`link-text-lint`, `frontmatter-lint` (`--allow-missing`, so plain docs pass and only files that
*have* frontmatter get validated), `list-lint`, `whitespace-lint`, `reference-link-lint`,
`bare-url-lint`, `emphasis-heading-lint`, and `atx-heading-space-lint`. These fail only on genuine
defects: a dead link, an unclosed fence, a missing `alt`, an empty/whitespace link text, malformed
frontmatter, a list that mixes bullet markers / botches its numbering, trailing whitespace /
hard tabs / CRLF / a missing final newline, an undefined `[text][ref]`, a bare URL, a whole line of
bold used as a heading, or a `##Heading` that lost its space and stopped being one. (`list-lint`'s
odd-indent, `whitespace-lint`'s multiple-blank-lines, and `link-text-lint`'s non-descriptive /
raw-URL rules are non-failing warnings.)

**Two checks are opt-in** — `heading-lint` and `table-fmt --check` — because they can flag
deliberate style (repeated sub-headings across sections, hand-aligned tables), not bugs. Turn them
on for a strict pass:

```bash
CHECK_HEADINGS=1 CHECK_TABLES=1 bash examples/check-docs.sh
```

Every check is individually toggleable (`1` = run, `0` = skip):
`CHECK_LINKS`, `CHECK_FENCES`, `CHECK_ALT`, `CHECK_LINK_TEXT`, `CHECK_FRONTMATTER`, `CHECK_LISTS`, `CHECK_WHITESPACE`, `CHECK_HEADINGS`, `CHECK_TABLES`.
For example, `CHECK_ALT=0 bash examples/check-docs.sh` skips the alt-text check.

To also verify a marker-based table of contents, list the files that use `<!-- TOC -->` markers:

```bash
TOC_FILES="README.md docs/guide.md" bash examples/check-docs.sh
```

The **changelog check runs automatically** when the repo has a `CHANGELOG.md` — `check-docs.sh`
auto-detects it and lints it with `changelog-lint.js`. Point it elsewhere with
`CHANGELOG_FILE=docs/CHANGELOG.md`, or skip it with `CHANGELOG_FILE=`.

> **Note:** the TOC check is opt-in per file because `markdown-toc.js --check` keys off the literal
> `<!-- TOC -->` markers — a doc that only *mentions* those strings in prose (like this README) would
> read as having a TOC it doesn't. The default checks have no such caveat and run on everything.

---

## 📜 License
MIT — Do whatever you want with these scripts!
