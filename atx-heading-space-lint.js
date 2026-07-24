#!/usr/bin/env node
/**
 * atx-heading-space-lint.js — flag ATX headings with the wrong spacing after the `#`s.
 *
 * The one that actually bites:
 *
 *     ##Setup
 *
 * You typed a heading. It is NOT one. CommonMark (and GitHub) require a **space**
 * between the `#` run and the text — without it, `##Setup` is not a heading at all,
 * it's a plain paragraph that happens to start with two hashes. So it renders as
 * literal "##Setup" text, produces no anchor, no table-of-contents entry, and no
 * screen-reader heading stop. markdownlint calls this MD018 ("no space after hash").
 *
 * It's the same failure this repo's emphasis-heading-lint.js catches from the other
 * direction: there, something that ISN'T a heading renders like one; here, something
 * you MEANT as a heading silently renders as body text. Both are invisible to every
 * tool that reads document outline — heading-lint.js and markdown-toc.js included,
 * because to them the heading simply doesn't exist.
 *
 * Two rules, both about the space after the opening `#`s:
 *
 *   1. no-space-after-hash    `##Setup`     → MD018. The real bug: not a heading at
 *                             all. ERROR — it changes what renders.
 *   2. multiple-spaces        `##  Setup`   → MD019. Cosmetic: it still renders as a
 *                             heading, but the extra spaces are diff noise and
 *                             inconsistent. WARNING by default (toggle with
 *                             --no-multiple-space to check only the real bug).
 *
 * Scope, honestly stated: this checks the *opening* of ATX headings (`#`/`##`/…).
 * The rarely-used "closed" form with trailing hashes (`## Setup ##`, markdownlint
 * MD020/MD021) is intentionally NOT covered — closed ATX is uncommon and a
 * half-right detector is worse than none. Setext headings (underlined with `===` /
 * `---`) have no `#` and aren't in scope either.
 *
 * What it does NOT flag:
 *   - Correct headings (`## Setup`), and bare/empty headings (`##`, `###   `).
 *   - Lines with 7+ leading hashes (`#######…`) — not a heading in CommonMark.
 *   - Anything indented 4+ spaces (that's an indented code block, not a heading).
 *   - Anything inside ``` fenced ``` or ~~~ code blocks — so a `#define` or a
 *     `#!/bin/sh` shebang in an example block is left alone.
 *
 * Heuristic caveat (same as markdownlint MD018): a NON-heading line that genuinely
 * starts with a hash in prose — `#1 priority`, a bare `#hashtag` — will be flagged,
 * because it's indistinguishable from a botched heading and renders as literal text
 * either way. If you mean a literal leading hash, escape it (`\#1`) or fence it; if
 * you mean a heading, add the space. That's the fix the rule is steering you to.
 *
 * Fence-aware like every other linter in this repo. Zero dependencies, Node built-ins
 * only. Works on any Node >= 14.
 *
 * Usage:
 *   node atx-heading-space-lint.js README.md                 # check one file
 *   node atx-heading-space-lint.js README.md docs/*.md         # check several
 *   node atx-heading-space-lint.js README.md --json            # machine-readable
 *   node atx-heading-space-lint.js README.md --quiet           # only print problems
 *   node atx-heading-space-lint.js README.md --no-multiple-space # only the MD018 bug
 *
 * Exit codes: 0 clean · 1 problems found · 2 usage/read error.
 */

'use strict';

const fs = require('fs');

function printHelp() {
  const lines = [
    'atx-heading-space-lint.js — flag ATX headings with wrong spacing after the `#`s. (markdownlint MD018/MD019)',
    '',
    'Usage:',
    '  node atx-heading-space-lint.js <file.md> [more.md ...] [options]',
    '',
    'Options:',
    '  --no-multiple-space  Only flag the real bug (MD018, no space after hash);',
    '                       ignore the cosmetic multiple-spaces case (MD019).',
    '  --json               Emit a machine-readable report.',
    '  --quiet              Print only files with problems (suppress per-file OK line).',
    '  -h, --help           Show this help.',
    '',
    'Exit codes: 0 clean · 1 problems found · 2 usage/read error.',
  ];
  console.log(lines.join('\n'));
}

/**
 * Classify a single line's ATX-heading spacing.
 * Returns null if the line is not an ATX-heading candidate or is correctly spaced,
 * else { rule: 'MD018'|'MD019', hashes, text }.
 *
 * A candidate is: up to 3 leading spaces, then 1-6 `#`, then some content. 4+ leading
 * spaces is an indented code block; 7+ hashes is not a heading — both return null.
 */
function classifyLine(line) {
  // Up to 3 spaces of indentation, then the full run of leading hashes.
  const m = /^( {0,3})(#+)(.*)$/.exec(line);
  if (!m) return null;

  const hashes = m[2];
  if (hashes.length > 6) return null; // 7+ hashes is not an ATX heading

  const after = m[3];

  // Bare heading (`##`) or hashes followed only by whitespace (`###   `): an empty
  // heading — valid spacing-wise, nothing to flag here.
  if (after.trim() === '') return null;

  const firstChar = after[0];

  // MD018 — no space (or tab) after the opening hashes: `##Setup`. Not a heading.
  if (firstChar !== ' ' && firstChar !== '\t') {
    return { rule: 'MD018', hashes, text: after.trim() };
  }

  // There IS whitespace after the hashes. If it's more than one space, that's MD019.
  const openWs = after.match(/^[ \t]+/)[0];
  if (openWs.length > 1) {
    return { rule: 'MD019', hashes, text: after.trim() };
  }

  // Exactly one space (or a single tab) — correctly spaced.
  return null;
}

/**
 * Lint one file's content. Returns an array of { line, rule, hashes, text }.
 * Fence-aware: skips ``` and ~~~ fenced blocks (same logic as the sibling linters).
 */
function lintContent(content, opts = {}) {
  const checkMultiple = opts.checkMultiple !== false; // MD019 on unless disabled
  const findings = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fence toggling — match the opening marker char, close only on the same char.
    const fenceOpen = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceOpen) {
      const marker = fenceOpen[1][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
        continue;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = '';
        continue;
      }
    }
    if (inFence) continue;

    const finding = classifyLine(line);
    if (finding === null) continue;
    if (finding.rule === 'MD019' && !checkMultiple) continue;

    findings.push({ line: i + 1, ...finding });
  }
  return findings;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    process.exit(argv.length === 0 ? 2 : 0);
  }

  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  const checkMultiple = !argv.includes('--no-multiple-space');

  const files = argv.filter((a) => !a.startsWith('-'));
  if (files.length === 0) {
    console.error('atx-heading-space-lint: no input files given.');
    process.exit(2);
  }

  const report = [];
  let totalFindings = 0;
  let readError = false;

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (err) {
      readError = true;
      if (!json) console.error(`atx-heading-space-lint: cannot read ${file}: ${err.message}`);
      report.push({ file, error: err.message, findings: [] });
      continue;
    }
    const findings = lintContent(content, { checkMultiple });
    totalFindings += findings.length;
    report.push({ file, findings });
  }

  if (json) {
    console.log(JSON.stringify({ totalFindings, files: report }, null, 2));
  } else {
    for (const entry of report) {
      if (entry.error) continue;
      if (entry.findings.length === 0) {
        if (!quiet) console.log(`✓ ${entry.file} — ATX heading spacing OK`);
        continue;
      }
      console.log(`✗ ${entry.file} — ${entry.findings.length} heading-spacing problem(s):`);
      for (const f of entry.findings) {
        if (f.rule === 'MD018') {
          console.log(`    ${entry.file}:${f.line}  [MD018] ${f.hashes}${f.text}`);
          console.log(`        no space after '${f.hashes}' — renders as text, not a heading. Fix: ${f.hashes} ${f.text}`);
        } else {
          console.log(`    ${entry.file}:${f.line}  [MD019] ${f.hashes}  ${f.text}`);
          console.log(`        multiple spaces after '${f.hashes}' — collapse to one: ${f.hashes} ${f.text}`);
        }
      }
    }
  }

  if (readError) process.exit(2);
  process.exit(totalFindings > 0 ? 1 : 0);
}

// Run only when invoked directly, so the functions can be require()'d and tested.
if (require.main === module) {
  main();
}

module.exports = { lintContent, classifyLine };
