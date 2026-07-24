#!/usr/bin/env node
/**
 * emphasis-marker-space-lint.js — flag spaces INSIDE emphasis markers, which
 * silently break the emphasis. (markdownlint MD037)
 *
 * This does NOT render as bold:
 *
 *     Read the ** important ** part first.
 *
 * You typed bold. You got literal asterisks. CommonMark (and GitHub) only treat
 * `**` as emphasis when the opening marker is NOT followed by a space and the
 * closing marker is NOT preceded by one — the delimiter has to "hug" its text. Put
 * a space just inside either marker and the run stops being a valid emphasis
 * delimiter, so `** important **` renders as the four literal characters `** ` …
 * ` **` around the word, not as bold. markdownlint calls this MD037 ("spaces
 * inside emphasis markers").
 *
 * It's the exact inverse of the mistake atx-heading-space-lint.js catches: there,
 * a MISSING space stops `##Setup` from being a heading; here, an EXTRA space stops
 * `** text **` from being emphasis. Both are silent — the markup looks right in the
 * source and comes out wrong in the render, with no error anywhere.
 *
 * The broken shapes, for every marker (`**`, `__`, `*`, `_`):
 *
 *     ** text **     __ text __     * text *     _ text _      (space both sides)
 *     **text **      *text *                                    (space before close)
 *     ** text**      * text*                                    (space after open)
 *
 * The fix is always to delete the inner space(s): `** text **` → `**text**`.
 *
 * Precision over recall — this repo's rule is that a half-right linter is worse
 * than none, and `*` is wildly overloaded (list bullets, multiplication, globs).
 * So this flags ONLY a high-confidence broken span:
 *
 *   - a matched pair of the SAME marker on one line, with no marker char inside
 *     (one clean span — nested/adjacent emphasis is left alone),
 *   - a space immediately inside at least one marker (the MD037 signature),
 *   - the marker pair sitting on real emphasis boundaries: the char just OUTSIDE
 *     each marker is start/end-of-line, whitespace, or punctuation — never a word
 *     char (so `snake_case` and intraword `_` are never touched),
 *   - inner text that is a real word: trimmed length >= 2 AND contains a letter
 *     (so `2 * 3 * 4` and `a * b` — single-char/number content — are NOT flagged).
 *
 * What it does NOT flag:
 *   - Correct emphasis (`**bold**`, `_italic_`) — no inner space, nothing to fix.
 *   - List bullets (`* item`, `- item`, `+ item`) — the leading marker is a bullet,
 *     not an emphasis opener.
 *   - Math / globs / single-char spans (`2 * 3`, `a * b *`, `rm *.tmp`) — content
 *     guard (needs a >=2-char word) skips them.
 *   - `snake_case` and other intraword underscores — boundary guard skips them.
 *   - Spans containing another marker char (`**a *b* c**`) — left alone (conservative).
 *   - Anything inside ``` fenced ``` / ~~~ code blocks or `inline code` — masked out.
 *
 * Fence-aware and inline-code-aware like every other linter in this repo. Zero
 * dependencies, Node built-ins only. Works on any Node >= 14.
 *
 * Usage:
 *   node emphasis-marker-space-lint.js README.md                 # check one file
 *   node emphasis-marker-space-lint.js README.md docs/*.md         # check several
 *   node emphasis-marker-space-lint.js README.md --json            # machine-readable
 *   node emphasis-marker-space-lint.js README.md --quiet           # only print problems
 *
 * Exit codes: 0 clean · 1 broken emphasis found · 2 usage/read error.
 */

'use strict';

const fs = require('fs');

function printHelp() {
  const lines = [
    'emphasis-marker-space-lint.js — flag spaces inside emphasis markers. (markdownlint MD037)',
    '',
    'Usage:',
    '  node emphasis-marker-space-lint.js <file.md> [more.md ...] [options]',
    '',
    'Options:',
    '  --json     Emit a machine-readable report.',
    '  --quiet    Print only files with problems (suppress per-file OK line).',
    '  -h, --help Show this help.',
    '',
    'Exit codes: 0 clean · 1 broken emphasis found · 2 usage/read error.',
  ];
  console.log(lines.join('\n'));
}

// Replace inline code spans with an equal-length run of a NON-space filler so
// markers inside `code` aren't scanned — and columns stay accurate. The filler is
// a word char (not a space), because inline code is *content*: `**word `code`**`
// is valid bold, and masking the code with spaces would fake a broken inner space
// right next to the marker. Handles multi-backtick runs (`` `a` `` etc.) via the
// same-run-closes-the-span rule.
const CODE_FILLER = 'x';
function maskInlineCode(line) {
  return line.replace(/(`+)(.*?)\1/g, (full) => CODE_FILLER.repeat(full.length));
}

// Replace every occurrence of a substring with equal-length spaces (length-preserving).
function maskAll(line, sub) {
  if (!line.includes(sub)) return line;
  return line.split(sub).join(' '.repeat(sub.length));
}

const isWordChar = (ch) => ch !== undefined && /[0-9A-Za-z]/.test(ch);
// A valid emphasis boundary is anything that is NOT a word char: start/end of
// line, whitespace, or punctuation. Word char on the outside means intraword
// (`snake_case`) or a run we don't want to treat as a delimiter.
const isBoundary = (ch) => ch === undefined || !isWordChar(ch);

// Scan `masked` for broken spans of one marker. `char` is the marker's single
// char (`*` or `_`); `len` is 1 or 2. Pushes findings (with columns from the
// ORIGINAL line, which shares indices with the masked copy) into `out`.
function scanMarker(masked, char, len, out) {
  const marker = char.repeat(len);
  // marker + (inner: no marker char, at least one char, lazy) + marker
  const innerClass = char === '*' ? '[^*]' : '[^_]';
  const re = new RegExp(
    marker.replace(/[*]/g, '\\*') + '(' + innerClass + '+?)' + marker.replace(/[*]/g, '\\*'),
    'g'
  );
  let m;
  while ((m = re.exec(masked)) !== null) {
    const inner = m[1];
    const start = m.index;
    const end = start + m[0].length; // exclusive

    // Boundary guard: char just outside each marker must not be a word char.
    const before = start > 0 ? masked[start - 1] : undefined;
    const after = end < masked.length ? masked[end] : undefined;
    if (!isBoundary(before) || !isBoundary(after)) continue;

    // Broken signature: a space immediately inside a marker (leading/trailing).
    const broken = /^\s/.test(inner) || /\s$/.test(inner);
    if (!broken) continue;

    // Content guard: a real word — >=2 chars and at least one letter. Kills
    // math/globs/single-char spans (`2 * 3 *`, `a * b *`).
    const trimmed = inner.trim();
    if (trimmed.length < 2 || !/[A-Za-z]/.test(trimmed)) continue;

    out.push({ column: start + 1, marker, text: trimmed });
  }
}

/**
 * Lint one file's content. Returns findings: { line, column, marker, text }.
 * Fence-aware (skips ``` / ~~~ blocks) and inline-code-aware.
 */
function lintContent(content) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fence toggling — same logic as the sibling linters.
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

    // Mask inline code so `** x **` inside backticks is left alone.
    let masked = maskInlineCode(line);

    // Neutralize the list bullet: a leading `*`/`+`/`-` marker (after optional
    // indent) is a bullet, not an emphasis opener. Blank it so it can't pair.
    masked = masked.replace(/^(\s*)([*+-])(\s)/, (_, sp, b, s) => sp + ' ' + s);

    // Two-char markers first, then blank ALL double runs before scanning singles
    // so `**` never gets mis-read as two `*`.
    scanMarker(masked, '*', 2, collect(findings, i));
    scanMarker(masked, '_', 2, collect(findings, i));
    let single = maskAll(masked, '**');
    single = maskAll(single, '__');
    scanMarker(single, '*', 1, collect(findings, i));
    scanMarker(single, '_', 1, collect(findings, i));
  }
  return findings;
}

// Small adapter: scanMarker pushes {column,marker,text}; we attach the line no.
function collect(findings, lineIdx) {
  return {
    push(f) {
      findings.push({ line: lineIdx + 1, column: f.column, marker: f.marker, text: f.text });
    },
  };
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
    console.error('emphasis-marker-space-lint: no input files given.');
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
      if (!json) console.error(`emphasis-marker-space-lint: cannot read ${file}: ${err.message}`);
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
        if (!quiet) console.log(`✓ ${entry.file} — no broken emphasis`);
        continue;
      }
      console.log(`✗ ${entry.file} — ${entry.findings.length} broken emphasis (spaces inside markers):`);
      for (const f of entry.findings) {
        const fixed = f.marker + f.text + f.marker;
        console.log(`    ${entry.file}:${f.line}:${f.column}  ${f.marker} ${f.text} ${f.marker}  → ${fixed}`);
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

module.exports = { lintContent, maskInlineCode, scanMarker };
