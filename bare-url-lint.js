#!/usr/bin/env node
/**
 * bare-url-lint.js — flag bare URLs sitting naked in Markdown prose.
 *
 * GitHub auto-links a raw URL, so this *looks* fine in the rendered page:
 *
 *     See https://example.com/guide for details.
 *
 * markdownlint flags it anyway (MD034), and for good reasons a link checker
 * never sees — because this is about how the URL is *written*, not whether it
 * resolves:
 *
 *   1. Auto-linking isn't universal. GitHub does it; plenty of Markdown
 *      renderers (and every plain-text reader) leave the URL as dead text.
 *   2. A bare URL can't carry descriptive link text — the exact anti-pattern
 *      link-text-lint.js exists to catch, one step upstream.
 *   3. A trailing `.` or `)` gets swallowed into the auto-link or breaks it,
 *      so `see https://example.com.` links to `example.com.` (a real bug).
 *
 * The fix is always the same and always local: wrap it. `<https://example.com>`
 * for an autolink you meant on purpose, or `[text](https://example.com)` to give
 * it words. This script finds the naked ones so you can decide which.
 *
 * What it does NOT flag (these are already correctly written):
 *   - URLs inside a link or image — [text](url), ![alt](url), <url>
 *   - URLs in a reference definition — [label]: https://...  (see reference-link-lint.js)
 *   - anything inside ``` fences ``` or `inline code`
 *   - bare URLs on a line that is itself an HTML block (raw <a href> etc.)
 *
 * Fence-aware and inline-code-aware, like every other linter in this repo, so a
 * URL you're documenting in an example block doesn't get flagged.
 *
 * Zero dependencies. Node built-ins only.
 *
 * Usage:
 *   node bare-url-lint.js README.md                 # check one file
 *   node bare-url-lint.js README.md docs/*.md         # check several
 *   node bare-url-lint.js README.md --json            # machine-readable
 *   node bare-url-lint.js README.md --quiet           # only print problems
 *
 * Exit codes: 0 clean · 1 bare URLs found · 2 usage/read error.
 */

'use strict';

const fs = require('fs');

function printHelp() {
  const lines = [
    'bare-url-lint.js — flag bare URLs not wrapped in <> or [](). (markdownlint MD034)',
    '',
    'Usage:',
    '  node bare-url-lint.js <file.md> [more.md ...] [options]',
    '',
    'Options:',
    '  --json     Emit a machine-readable report.',
    '  --quiet    Print only files with problems (suppress the per-file OK line).',
    '  -h, --help Show this help.',
    '',
    'Exit codes: 0 clean · 1 bare URLs found · 2 usage/read error.',
  ];
  console.log(lines.join('\n'));
}

// A URL we consider "bare" if it appears in prose outside any link/image/autolink
// wrapper. We match http(s) and ftp schemes — the ones renderers auto-link.
const URL_RE = /(?:https?|ftp):\/\/[^\s<>()\[\]`]*[^\s<>()\[\]`.,;:!?'"]/gi;

/**
 * Given a single logical line (already known to be outside a code fence),
 * return the byte offsets that are "protected" — inside inline code, an
 * inline/reference link or image target, or an angle-bracket autolink — so a
 * URL starting in one of those ranges is not a bare URL.
 */
function protectedRanges(line) {
  const ranges = [];

  // 1. Inline code spans: `...` (and ``...`` etc). Match runs of backticks.
  const codeRe = /(`+)(?:[^`]|(?!\1)`)*?\1/g;
  let m;
  while ((m = codeRe.exec(line)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }

  // 2. Angle-bracket autolinks: <https://...>. Already correct — protect them.
  const autoRe = /<(?:https?|ftp):\/\/[^>\s]+>/gi;
  while ((m = autoRe.exec(line)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }

  // 3. Inline link / image targets: the (url) part of [text](url) and ![alt](url).
  //    Protect the whole (...) so the URL inside doesn't read as bare.
  const inlineRe = /\]\(\s*<?[^)\s]+>?(?:\s+"[^"]*")?\s*\)/g;
  while ((m = inlineRe.exec(line)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }

  // 4. Reference definitions: `[label]: https://...` — reference-link-lint's job.
  //    Protect the URL after the colon.
  const refRe = /^\s*\[[^\]]+\]:\s+\S+/;
  const refM = refRe.exec(line);
  if (refM) ranges.push([refM.index, refM.index + refM[0].length]);

  // 5. Raw HTML with an href/src attribute: <a href="...">, <img src="...">.
  //    Protect the whole tag.
  const htmlRe = /<[a-zA-Z][^>]*\b(?:href|src)\s*=\s*["'][^"']*["'][^>]*>/g;
  while ((m = htmlRe.exec(line)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }

  return ranges;
}

function inRanges(pos, ranges) {
  for (const [start, end] of ranges) {
    if (pos >= start && pos < end) return true;
  }
  return false;
}

/**
 * Lint one file's content. Returns an array of { line, col, url } findings.
 * Fence-aware: skips ``` and ~~~ fenced blocks entirely.
 */
function lintContent(content) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fence toggling — match the opening marker (``` or ~~~, 3+ chars) and only
    // close on the same marker char, so a ~~~ inside a ``` block doesn't close it.
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

    const ranges = protectedRanges(line);
    let m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(line)) !== null) {
      if (!inRanges(m.index, ranges)) {
        findings.push({ line: i + 1, col: m.index + 1, url: m[0] });
      }
    }
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
  const files = argv.filter((a) => !a.startsWith('-'));

  if (files.length === 0) {
    console.error('bare-url-lint: no input files given.');
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
      if (!json) console.error(`bare-url-lint: cannot read ${file}: ${err.message}`);
      report.push({ file, error: err.message, findings: [] });
      continue;
    }
    const findings = lintContent(content);
    totalFindings += findings.length;
    report.push({ file, findings });
  }

  if (json) {
    console.log(JSON.stringify({ totalFindings, files: report }, null, 2));
  } else {
    for (const entry of report) {
      if (entry.error) continue;
      if (entry.findings.length === 0) {
        if (!quiet) console.log(`✓ ${entry.file} — no bare URLs`);
        continue;
      }
      console.log(`✗ ${entry.file} — ${entry.findings.length} bare URL(s):`);
      for (const f of entry.findings) {
        console.log(`    ${entry.file}:${f.line}:${f.col}  ${f.url}`);
        console.log(`        wrap it: <${f.url}>  or  [text](${f.url})`);
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

module.exports = { lintContent, protectedRanges };
