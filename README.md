# 🛠️ Helpful GitHub Scripts

A curated collection of highly robust, custom-built Node/Python automation scripts to supercharge your GitHub Profile, automate multiple Projects boards management, dynamic README synchronization, and open-source contribution logs tracking.

---

## 📋 Table of Contents
1. [auto-classify-projects.js](#1-auto-classify-projectsjs)
2. [sync-profile-readme.js](#2-sync-profile-readmejs)
3. [oss-contributor-log.py](#3-oss-contributor-logpy)
4. [markdown-toc.js](#4-markdown-tocjs)

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
```

Add `<!-- TOC -->` and `<!-- /TOC -->` where you want it, then wire `--write` into a pre-commit hook to keep it fresh automatically.

### 📦 Reusable functions:
The script also exports its internals (`slugify`, `extractHeadings`, `buildToc`, `injectToc`) so you can `require()` it in your own tooling.

---

## 📜 License
MIT — Do whatever you want with these scripts!
