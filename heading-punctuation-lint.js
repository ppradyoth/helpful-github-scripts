#!/usr/bin/env node
/**
 * heading-punctuation-lint.js — flag ATX headings that end in trailing punctuation.
 *
 * The one that reads wrong:
 *
 *     ## Installation:
 *     ### Don't do this.
 *
 * A heading is a label, not a sentence. Trailing `.`/`,`/`:`/`;`/`!` on a heading is
 * the tell of prose that got promoted to a heading, or a heading that trails off into
 * the paragraph below it. It's cosmetic — the heading still renders and still anchors —
 * but it's inconsistent, it shows up in the table of contents and the browser tab, and
 * the generated `#anchor` slug quietly carries the punctuation too. markdownlint calls
 * this MD026 ("trailing punctuation in heading").
 *
 * The companion pieces already in this repo look at heading *structure* and *spacing*:
 * heading-lint.js (duplicate/skipped/empty headings), atx-heading-space-lint.js (the
 * space after the `#`s, MD018/019), emphasis-heading-lint.js (bold used AS a heading,
 * MD036). None of them read the LAST character of the heading text — that's this one's
 * whole job.
 *
 * The rule, and why `?` is exempt:
 *
 *   MD026  A heading's text ends in one of . , ; : ! (and the full-width CJK forms
 *          。，；：！). ERROR by default — it's a consistency bug, mechanically fixable.
 *          A trailing `?` is NOT flagged: "What is jugaad?" is a legitimate heading, and
 *          markdownlint's default punctuation set deliberately omits `?`/`？` for exactly
 *          this reason. (Same default set as markdownlint: `.,;:!。，；：！`.)
 *
 * Scope, honestly stated:
 *   - ATX headings only (`#`/`##`/… `). The closing form `## Heading. ##` IS handled:
 *     the trailing `#`s are stripped before the last character is read, so the `.` before
 *     them is still caught.
 *   - Setext headings (text underlined with `===` / `---`) are intentionally NOT covered.
 *     Detecting them reliably means disambiguating a `---` underline from a thematic break
 *     and a `-` list — a half-right detector is worse than none, the same line this repo's
 *     other heading linters draw. Setext headings are rare; ATX is where this bites.
 *   - A heading whose text is ONLY punctuation (`# ...`, `# !!!`) is left alone — there's
 *     no real word to strip punctuation from, so flagging it would be noise.
 *
 * What it does NOT flag:
 *   - Correct headings (`## Installation`), question headings (`## Why jugaad?`), and
 *     empty/bare headings (`##`, `###   `).
 *   - `##Installation:` — that's not a heading at all (no space after the `#`s); it's
 *     atx-heading-space-lint.js's MD018 to catch, not this one's.
 *   - Anything inside ``` fenced ``` or ~~~ code blocks — a commented `# TODO:` in an
 *     example block is left alone. Fence-aware like every linter in this repo.
 *
 * `--fix` is safe and idempotent: it strips the trailing run of punctuation from the
 * heading text (preserving indentation and any closing `#`s), inserts nothing, and running
 * it twice is a byte-for-byte no-op. Mechanical, so it lives in the `--fix` family with
 * whitespace-lint.js and fence-blank-lines-lint.js.
 *
 * Zero dependencies, Node built-ins only. Works on any Node >= 14.
 *
 * Usage:
 *   node heading-punctuation-lint.js README.md                 # check one file
 *   node heading-punctuation-lint.js README.md docs/*.md        # check several
 *   node heading-punctuation-lint.js README.md --fix            # strip trailing punctuation
 *   node heading-punctuation-lint.js README.md --json           # machine-readable
 *   node heading-punctuation-lint.js README.md --quiet          # only print problems
 *
 * Exit codes: 0 clean (or all fixed) · 1 problems found · 2 usage/read error.
 */

'use strict';

const fs = require('fs');

// markdownlint MD026's default punctuation set — note `?`/`？` are deliberately absent.
const PUNCTUATION = '.,;:!。，；：！';
const PUNCT_SET = new Set(PUNCTUATION.split(''));

function printHelp() {
  const lines = [
    'heading-punctuation-lint.js — flag ATX headings ending in trailing punctuation. (markdownlint MD026)',
    '',
    'Usage:',
    '  node heading-punctuation-lint.js <file.md> [more.md ...] [options]',
    '',
    'Options:',
    '  --fix      Strip the trailing punctuation from each flagged heading in place',
    '             (preserves indentation and closing `#`s; idempotent).',
    '  --json     Emit a machine-readable report.',
    '  --quiet    Print only files with problems (suppress per-file OK line).',
    '  -h, --help Show this help.',
    '',
    `Punctuation flagged: ${PUNCTUATION.split('').join(' ')}   (a trailing ? is allowed)`,
    '',
    'Exit codes: 0 clean (or all fixed) · 1 problems found · 2 usage/read error.',
  ];
  console.log(lines.join('\n'));
}

/**
 * Split an ATX-heading line into its parts, or return null if the line is not a
 * (correctly-opened) ATX heading with real text.
 *
 * Returns { indent, hashes, gap, text, close } where the line reconstructs exactly as
 * indent + hashes + gap + text + close. `close` is any trailing " ##"-style closing
 * sequence (including the space before it) plus trailing whitespace; '' if none.
 */
function parseHeading(line) {
  // indent (0-3 spaces), 1-6 hashes, then at least one space/tab, then the rest.
  const m = /^( {0,3})(#{1,6})([ \t]+)(.*)$/.exec(line);
  if (!m) return null;

  const [, indent, hashes, gap, rest] = m;

  // Strip an optional closing sequence: spaces + a run of `#` + trailing spaces at EOL.
  // e.g. "Setup ##   " → text "Setup", close " ##   ".
  let text = rest;
  let close = '';
  const closeMatch = /([ \t]+#+[ \t]*)$/.exec(rest);
  if (closeMatch) {
    text = rest.slice(0, closeMatch.index);
    close = closeMatch[1];
  } else {
    // No closing hashes, but preserve any pure trailing whitespace as part of `close`
    // so a fix never disturbs it.
    const wsMatch = /([ \t]+)$/.exec(rest);
    if (wsMatch) {
      text = rest.slice(0, wsMatch.index);
      close = wsMatch[1];
    }
  }

  if (text.trim() === '') return null; // bare/empty heading — nothing to judge
  return { indent, hashes, gap, text, close };
}

/**
 * Classify one line. Returns null, or { rule:'MD026', hashes, text, mark } where `mark`
 * is the offending trailing punctuation character.
 */
function classifyLine(line) {
  const parsed = parseHeading(line);
  if (parsed === null) return null;

  const { hashes, text } = parsed;
  const trimmed = text.replace(/[ \t]+$/, '');
  const last = trimmed[trimmed.length - 1];
  if (!PUNCT_SET.has(last)) return null;

  // Require at least one non-punctuation, non-space character — skip punctuation-only
  // "headings" like `# !!!` where there's no word to strip from.
  const hasWord = trimmed.split('').some((c) => c !== ' ' && c !== '\t' && !PUNCT_SET.has(c));
  if (!hasWord) return null;

  return { rule: 'MD026', hashes, text: trimmed, mark: last };
}

/** Produce the fixed version of a single heading line, or null if nothing to fix. */
function fixLine(line) {
  const parsed = parseHeading(line);
  if (parsed === null) return null;

  const { indent, hashes, gap, text, close } = parsed;
  const trailingWs = (/[ \t]*$/.exec(text) || [''])[0];
  const core = text.slice(0, text.length - trailingWs.length);

  // Strip the trailing run of punctuation from the core text.
  let end = core.length;
  while (end > 0 && PUNCT_SET.has(core[end - 1])) end--;
  const stripped = core.slice(0, end);

  // Guard: same rules as classifyLine — only fix when there was a real word AND real
  // trailing punctuation to remove.
  if (end === core.length) return null; // nothing stripped
  const hasWord = stripped.split('').some((c) => c !== ' ' && c !== '\t' && !PUNCT_SET.has(c));
  if (!hasWord) return null;

  return indent + hashes + gap + stripped + trailingWs + close;
}

/**
 * Lint one file's content. Returns an array of { line, rule, hashes, text, mark }.
 * Fence-aware: skips ``` and ~~~ fenced blocks.
 */
function lintContent(content) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

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
    findings.push({ line: i + 1, ...finding });
  }
  return findings;
}

/**
 * Return { content, fixed } — content with every flagged heading's trailing punctuation
 * stripped, and a count of headings changed. Fence-aware, same as lintContent.
 */
function fixContent(content) {
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = '';
  let fixed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

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

    if (classifyLine(line) === null) continue;
    const repaired = fixLine(line);
    if (repaired !== null && repaired !== line) {
      lines[i] = repaired;
      fixed++;
    }
  }
  // Preserve the file's original trailing-newline shape by re-joining on '\n'; callers
  // that care about CRLF should run whitespace-lint.js --fix, which owns line endings.
  return { content: lines.join('\n'), fixed };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    process.exit(argv.length === 0 ? 2 : 0);
  }

  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  const fix = argv.includes('--fix');

  const files = argv.filter((a) => !a.startsWith('-'));
  if (files.length === 0) {
    console.error('heading-punctuation-lint: no input files given.');
    process.exit(2);
  }

  const report = [];
  let totalFindings = 0;
  let totalFixed = 0;
  let readError = false;

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (err) {
      readError = true;
      if (!json) console.error(`heading-punctuation-lint: cannot read ${file}: ${err.message}`);
      report.push({ file, error: err.message, findings: [] });
      continue;
    }

    if (fix) {
      const { content: fixedContent, fixed } = fixContent(content);
      if (fixed > 0) {
        try {
          fs.writeFileSync(file, fixedContent);
        } catch (err) {
          readError = true;
          if (!json) console.error(`heading-punctuation-lint: cannot write ${file}: ${err.message}`);
          report.push({ file, error: err.message, findings: [] });
          continue;
        }
      }
      totalFixed += fixed;
      report.push({ file, fixed });
      continue;
    }

    const findings = lintContent(content);
    totalFindings += findings.length;
    report.push({ file, findings });
  }

  if (json) {
    if (fix) {
      console.log(JSON.stringify({ totalFixed, files: report }, null, 2));
    } else {
      console.log(JSON.stringify({ totalFindings, files: report }, null, 2));
    }
  } else if (fix) {
    for (const entry of report) {
      if (entry.error) continue;
      if (entry.fixed === 0) {
        if (!quiet) console.log(`✓ ${entry.file} — no trailing heading punctuation`);
      } else {
        console.log(`✎ ${entry.file} — stripped trailing punctuation from ${entry.fixed} heading(s)`);
      }
    }
  } else {
    for (const entry of report) {
      if (entry.error) continue;
      if (entry.findings.length === 0) {
        if (!quiet) console.log(`✓ ${entry.file} — no trailing heading punctuation`);
        continue;
      }
      console.log(`✗ ${entry.file} — ${entry.findings.length} heading(s) end in punctuation:`);
      for (const f of entry.findings) {
        console.log(`    ${entry.file}:${f.line}  [MD026] ${f.hashes} ${f.text}`);
        console.log(`        drop the trailing '${f.mark}' — a heading is a label, not a sentence.`);
      }
    }
  }

  if (readError) process.exit(2);
  if (fix) process.exit(0);
  process.exit(totalFindings > 0 ? 1 : 0);
}

// Run only when invoked directly, so the functions can be require()'d and tested.
if (require.main === module) {
  main();
}

module.exports = { lintContent, fixContent, classifyLine, fixLine, PUNCTUATION };
