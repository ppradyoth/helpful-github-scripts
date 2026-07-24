#!/usr/bin/env node
/**
 * emphasis-heading-lint.js — flag a whole line of bold/italic used as a heading.
 *
 * This renders as a heading and is not one:
 *
 *     **Installation**
 *
 *     Run npm install and you're set.
 *
 * It LOOKS like a section title, but it's a paragraph in bold. markdownlint flags
 * it (MD036) — "emphasis used instead of a heading" — for reasons the eye misses:
 *
 *   1. It's invisible to structure. It produces no `#` heading, so it never lands
 *      in a table of contents, gets no anchor, and can't be linked to. heading-lint
 *      and markdown-toc simply don't see it — to every tool that reads document
 *      outline, that section doesn't exist.
 *   2. It breaks accessibility. Screen readers navigate by real headings; a bold
 *      paragraph is announced as ordinary text, so a whole section becomes
 *      un-navigable.
 *   3. It skips the level system. A real `##`/`###` carries depth; bold carries
 *      none, so the reader loses the nesting the author meant.
 *
 * The fix is almost always to promote it: `**Installation**` → `### Installation`,
 * at whatever level fits the surrounding outline. This script finds the fake
 * headings so you can promote the ones that are really section titles.
 *
 * What counts as a fake heading (matches markdownlint MD036):
 *   - A single line that is ENTIRELY one emphasis span — `**text**`, `__text__`,
 *     `*text*`, or `_text_` — with nothing else on the line.
 *   - The emphasized text does NOT end in sentence punctuation. A line like
 *     `*Note that this is slow.*` ends in `.` — that's an emphasized SENTENCE, not
 *     a heading, so it's left alone. (Punctuation set configurable via --punctuation.)
 *
 * What it does NOT flag (these aren't fake headings):
 *   - Real headings (`## text`), list items (`- **Bold** intro:` — bold label in a
 *     list), blockquotes (`> **Note**`), and table rows (`| **x** |`).
 *   - A bold span that's only PART of a line (`This is **important** context`).
 *   - Emphasis ending in punctuation (`**Warning!**`, `*See below:*`).
 *   - Anything inside ``` fenced ``` code blocks.
 *
 * Fence-aware like every other linter in this repo, so a `**bold**` line inside an
 * example block doesn't get flagged.
 *
 * Zero dependencies. Node built-ins only. Works on any Node >= 14.
 *
 * Usage:
 *   node emphasis-heading-lint.js README.md                 # check one file
 *   node emphasis-heading-lint.js README.md docs/*.md         # check several
 *   node emphasis-heading-lint.js README.md --json            # machine-readable
 *   node emphasis-heading-lint.js README.md --quiet           # only print problems
 *   node emphasis-heading-lint.js README.md --punctuation ".,;:"  # custom trailing set
 *
 * Exit codes: 0 clean · 1 fake headings found · 2 usage/read error.
 */

'use strict';

const fs = require('fs');

// Sentence-ending punctuation. A whole-line emphasis span ending in one of these
// reads as an emphasized sentence, not a heading, so we don't flag it. Mirrors
// markdownlint MD036's default `punctuation` set (ASCII + CJK).
const DEFAULT_PUNCTUATION = '.,;:!?。，；：！？';

function printHelp() {
  const lines = [
    'emphasis-heading-lint.js — flag whole-line bold/italic used as a heading. (markdownlint MD036)',
    '',
    'Usage:',
    '  node emphasis-heading-lint.js <file.md> [more.md ...] [options]',
    '',
    'Options:',
    '  --json               Emit a machine-readable report.',
    '  --quiet              Print only files with problems (suppress per-file OK line).',
    '  --punctuation <set>  Trailing chars that mean "sentence, not heading"',
    `                       (default: ${JSON.stringify(DEFAULT_PUNCTUATION)}). Pass "" to flag regardless.`,
    '  -h, --help           Show this help.',
    '',
    'Exit codes: 0 clean · 1 fake headings found · 2 usage/read error.',
  ];
  console.log(lines.join('\n'));
}

/**
 * If `line` is entirely a single emphasis span, return the inner text; else null.
 * Accepts **strong**, __strong__, *em*, _em_ — but only when the markers wrap the
 * WHOLE trimmed line and there is no other emphasis marker of that char inside
 * (so `**a** and **b**` — two spans — is not treated as one heading).
 */
function wholeLineEmphasis(trimmed) {
  // Ordered so the two-char markers are tried before the one-char ones.
  const markers = [
    { open: '**', close: '**', char: '*' },
    { open: '__', close: '__', char: '_' },
    { open: '*', close: '*', char: '*' },
    { open: '_', close: '_', char: '_' },
  ];
  for (const { open, close, char } of markers) {
    if (
      trimmed.length > open.length + close.length &&
      trimmed.startsWith(open) &&
      trimmed.endsWith(close)
    ) {
      const inner = trimmed.slice(open.length, trimmed.length - close.length);
      // Inner must be non-empty and must NOT itself contain the marker char, which
      // would mean multiple spans / nested markers rather than one clean heading.
      if (inner.length > 0 && !inner.includes(char)) {
        return inner;
      }
    }
  }
  return null;
}

/**
 * Lint one file's content. Returns an array of { line, text } findings, where
 * `text` is the emphasized text that should probably be a heading.
 *
 * Fence-aware: skips ``` and ~~~ fenced blocks. Ignores real headings, list
 * items, blockquotes, and table rows — none of which are "emphasis used as a
 * heading" even when they contain bold.
 */
function lintContent(content, opts = {}) {
  const punctuation = opts.punctuation != null ? opts.punctuation : DEFAULT_PUNCTUATION;
  const findings = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fence toggling — same logic as the sibling linters: match the opening
    // marker char and only close on the same char.
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

    const trimmed = line.trim();
    if (trimmed === '') continue;

    // Skip constructs that aren't paragraphs-as-headings even when bold:
    //   real heading, list item, blockquote, table row, thematic break, HTML.
    if (/^#{1,6}\s/.test(trimmed)) continue;                 // # heading
    if (/^([-*+]|\d+[.)])\s/.test(trimmed)) continue;        // - / * / 1. list item
    if (/^>/.test(trimmed)) continue;                        // > blockquote
    if (/^\|/.test(trimmed)) continue;                       // | table row
    if (/^(?:[-*_]\s*){3,}$/.test(trimmed)) continue;        // --- thematic break
    if (/^<\/?[a-zA-Z]/.test(trimmed)) continue;             // raw HTML line

    const inner = wholeLineEmphasis(trimmed);
    if (inner === null) continue;

    // Ends in sentence punctuation → it's an emphasized sentence, not a heading.
    const lastChar = inner.trim().slice(-1);
    if (punctuation.includes(lastChar)) continue;

    findings.push({ line: i + 1, text: inner.trim() });
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

  // --punctuation <set> — consume the following token as the value.
  let punctuation = DEFAULT_PUNCTUATION;
  const punctIdx = argv.indexOf('--punctuation');
  if (punctIdx !== -1) {
    if (punctIdx + 1 >= argv.length) {
      console.error('emphasis-heading-lint: --punctuation needs a value (use "" for none).');
      process.exit(2);
    }
    punctuation = argv[punctIdx + 1];
  }

  const files = argv.filter((a, idx) => {
    if (a.startsWith('-')) return false;
    if (punctIdx !== -1 && idx === punctIdx + 1) return false; // the --punctuation value
    return true;
  });

  if (files.length === 0) {
    console.error('emphasis-heading-lint: no input files given.');
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
      if (!json) console.error(`emphasis-heading-lint: cannot read ${file}: ${err.message}`);
      report.push({ file, error: err.message, findings: [] });
      continue;
    }
    const findings = lintContent(content, { punctuation });
    totalFindings += findings.length;
    report.push({ file, findings });
  }

  if (json) {
    console.log(JSON.stringify({ totalFindings, files: report }, null, 2));
  } else {
    for (const entry of report) {
      if (entry.error) continue;
      if (entry.findings.length === 0) {
        if (!quiet) console.log(`✓ ${entry.file} — no emphasis-as-heading`);
        continue;
      }
      console.log(`✗ ${entry.file} — ${entry.findings.length} emphasis-as-heading:`);
      for (const f of entry.findings) {
        console.log(`    ${entry.file}:${f.line}  **${f.text}**`);
        console.log(`        looks like a heading — promote it: ### ${f.text}`);
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

module.exports = { lintContent, wholeLineEmphasis };
