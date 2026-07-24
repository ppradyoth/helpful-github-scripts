#!/usr/bin/env node
/**
 * fence-blank-lines-lint.js — flag fenced code blocks not surrounded by blank lines.
 *
 * The bug it catches:
 *
 *     Here is the command:
 *     ```bash
 *     npm test
 *     ```
 *     And that runs the suite.
 *
 * That fence is glued to the paragraphs above and below it. CommonMark is lenient
 * enough that GitHub usually still renders it — but many strict Markdown parsers
 * (and a lot of static-site generators, linters, and docs pipelines) require a
 * **blank line before an opening fence and after a closing fence**. Without them the
 * fence can render as part of the surrounding paragraph, the language hint can be
 * dropped, or the whole block can fail to open. markdownlint calls this MD031
 * ("fenced code blocks should be surrounded by blank lines").
 *
 * It is a *different* rule from this repo's code-fence-lint.js, which checks whether a
 * fence is closed and carries a language — the fence's own well-formedness. This one
 * ignores what's inside the fence entirely and only checks the two lines that bracket
 * it. A fence can be perfectly closed and still be glued to its neighbours. Run both.
 *
 * Two findings, both MD031:
 *
 *   1. missing-blank-before   text immediately above the opening ``` / ~~~
 *   2. missing-blank-after    text immediately below the closing ``` / ~~~
 *
 * Scope, honestly stated:
 *   - Only fenced code blocks (``` and ~~~). Indented (4-space) code blocks are a
 *     different construct and are NOT in scope.
 *   - MD032 (blank lines around *lists*) is deliberately NOT covered here. List
 *     continuation/nesting makes a half-right list detector worse than none; this file
 *     does one rule correctly. (Same discipline as atx-heading-space-lint.js skipping
 *     closed-ATX MD020/MD021.)
 *   - A fence at the very start of the file needs no blank line before it; a fence at
 *     the very end needs none after. Those are correct, not flagged.
 *
 * --fix inserts exactly one blank line where one is missing (never more), leaving fences
 * that are already spaced untouched. Idempotent: running --fix twice changes nothing the
 * second time.
 *
 * Zero dependencies, Node built-ins only. Works on any Node >= 14.
 *
 * Usage:
 *   node fence-blank-lines-lint.js README.md                 # check one file
 *   node fence-blank-lines-lint.js README.md docs/*.md         # check several
 *   node fence-blank-lines-lint.js README.md --fix             # insert the missing blanks
 *   node fence-blank-lines-lint.js README.md --json            # machine-readable
 *   node fence-blank-lines-lint.js README.md --quiet           # only print problems
 *
 * Exit codes: 0 clean (or all fixed) · 1 problems found (without --fix) · 2 usage/read/write error.
 */

'use strict';

const fs = require('fs');

function printHelp() {
  const lines = [
    'fence-blank-lines-lint.js — flag fenced code blocks not surrounded by blank lines. (markdownlint MD031)',
    '',
    'Usage:',
    '  node fence-blank-lines-lint.js <file.md> [more.md ...] [options]',
    '',
    'Options:',
    '  --fix     Insert exactly one blank line where one is missing, in place.',
    '  --json    Emit a machine-readable report.',
    '  --quiet   Print only files with problems (suppress per-file OK line).',
    '  -h, --help  Show this help.',
    '',
    'Exit codes: 0 clean/fixed · 1 problems found (no --fix) · 2 usage/read/write error.',
  ];
  console.log(lines.join('\n'));
}

// An opening/closing fence: up to 3 leading spaces, then 3+ backticks or 3+ tildes.
// (4+ leading spaces is an indented code block, not a fence — same cutoff as the
// sibling linters.) Returns the marker char ('`' or '~') or null.
function fenceMarkerChar(line) {
  const m = /^( {0,3})(`{3,}|~{3,})/.exec(line);
  return m ? m[2][0] : null;
}

function isBlank(line) {
  return line === undefined || line.trim() === '';
}

/**
 * Lint one file's content. Returns an array of { line, rule:'MD031', kind, text }.
 * kind is 'missing-blank-before' or 'missing-blank-after'.
 *
 * Only the OUTER fence pair is considered — content between a matched open/close is
 * code and is never inspected (a stray ``` inside is part of the code, not a new fence).
 */
function lintContent(content) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let marker = '';

  for (let i = 0; i < lines.length; i++) {
    const ch = fenceMarkerChar(lines[i]);
    if (ch === null) continue;

    if (!inFence) {
      // Opening fence. Check the line above it (unless it's the first line).
      if (i > 0 && !isBlank(lines[i - 1])) {
        findings.push({
          line: i + 1,
          rule: 'MD031',
          kind: 'missing-blank-before',
          text: lines[i].trim(),
        });
      }
      inFence = true;
      marker = ch;
    } else if (ch === marker) {
      // Closing fence (same marker char). Check the line below it (unless it's last).
      if (i < lines.length - 1 && !isBlank(lines[i + 1])) {
        findings.push({
          line: i + 1,
          rule: 'MD031',
          kind: 'missing-blank-after',
          text: lines[i].trim(),
        });
      }
      inFence = false;
      marker = '';
    }
    // A different fence char while inFence is just code content — ignore.
  }
  return findings;
}

/**
 * Return content with exactly one blank line inserted wherever MD031 is violated.
 * Idempotent — already-spaced fences are left as-is.
 */
function fixContent(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let inFence = false;
  let marker = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ch = fenceMarkerChar(line);

    if (ch !== null && !inFence) {
      // Opening fence — ensure a blank line precedes it (unless at file start).
      if (out.length > 0 && !isBlank(out[out.length - 1])) out.push('');
      out.push(line);
      inFence = true;
      marker = ch;
      continue;
    }
    if (ch !== null && inFence && ch === marker) {
      // Closing fence — emit it, then ensure a blank follows (unless the original
      // next line is already blank or this is the last line).
      out.push(line);
      inFence = false;
      marker = '';
      if (i < lines.length - 1 && !isBlank(lines[i + 1])) out.push('');
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function describe(kind) {
  return kind === 'missing-blank-before'
    ? 'no blank line before the opening fence — add one above it'
    : 'no blank line after the closing fence — add one below it';
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
    console.error('fence-blank-lines-lint: no input files given.');
    process.exit(2);
  }

  const report = [];
  let totalFindings = 0;
  let totalFixed = 0;
  let hardError = false;

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (err) {
      hardError = true;
      if (!json) console.error(`fence-blank-lines-lint: cannot read ${file}: ${err.message}`);
      report.push({ file, error: err.message, findings: [] });
      continue;
    }

    const findings = lintContent(content);

    if (fix && findings.length > 0) {
      const fixed = fixContent(content);
      try {
        fs.writeFileSync(file, fixed, 'utf8');
      } catch (err) {
        hardError = true;
        if (!json) console.error(`fence-blank-lines-lint: cannot write ${file}: ${err.message}`);
        report.push({ file, error: err.message, findings });
        continue;
      }
      totalFixed += findings.length;
      report.push({ file, findings, fixed: findings.length });
      continue;
    }

    totalFindings += findings.length;
    report.push({ file, findings });
  }

  if (json) {
    console.log(JSON.stringify({ totalFindings, totalFixed, files: report }, null, 2));
  } else {
    for (const entry of report) {
      if (entry.error) continue;
      if (entry.findings.length === 0) {
        if (!quiet) console.log(`✓ ${entry.file} — fenced blocks spaced OK`);
        continue;
      }
      if (entry.fixed) {
        console.log(`✓ ${entry.file} — inserted ${entry.fixed} blank line(s) around fences`);
        continue;
      }
      console.log(`✗ ${entry.file} — ${entry.findings.length} fence-spacing problem(s):`);
      for (const f of entry.findings) {
        console.log(`    ${entry.file}:${f.line}  [MD031] ${f.text}`);
        console.log(`        ${describe(f.kind)}`);
      }
    }
  }

  if (hardError) process.exit(2);
  if (fix) process.exit(0);
  process.exit(totalFindings > 0 ? 1 : 0);
}

// Run only when invoked directly, so the functions can be require()'d and tested.
if (require.main === module) {
  main();
}

module.exports = { lintContent, fixContent, fenceMarkerChar };
