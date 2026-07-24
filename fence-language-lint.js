#!/usr/bin/env node
/**
 * fence-language-lint.js — flag fenced code blocks that don't declare a language.
 *
 * The gap it catches:
 *
 *     ```
 *     npm test
 *     ```
 *
 * That block opens with a bare ``` — no language. GitHub still renders it, but with
 * no syntax highlighting, and a screen reader gets no language hint for the code.
 * Tag it and both problems go away:
 *
 *     ```bash
 *     npm test
 *     ```
 *
 * markdownlint calls this MD040 ("fenced code blocks should have a language specified").
 *
 * It is a *third*, distinct fence rule in this repo, and the three don't overlap:
 *   - code-fence-lint.js      — is the fence closed / well-formed?            (the fence itself)
 *   - fence-blank-lines-lint.js — is it surrounded by blank lines? (MD031)   (the lines bracketing it)
 *   - fence-language-lint.js  — does the opening fence name a language? (MD040)  (the info string)
 * A fence can be perfectly closed and correctly spaced and still be bare. Run all three.
 *
 * One finding, MD040:
 *   missing-language   an opening ``` / ~~~ with nothing after the marker
 *
 * Scope, honestly stated:
 *   - Only OPENING fences are judged. A CLOSING fence legitimately has no info string,
 *     so it is never flagged — the state machine only reads the info string when a fence
 *     opens.
 *   - Only fenced code blocks (``` and ~~~). Indented (4-space) code blocks have no fence
 *     to carry a language and are NOT in scope.
 *   - A backtick fence's info string may not contain a backtick (CommonMark); such a line
 *     is not a fence opener at all (it's a paragraph with inline code) and is skipped.
 *   - "Has a language" means any non-whitespace after the marker — including pandoc-style
 *     `{.python}` attributes. This rule checks that *something* is declared, not that the
 *     token is a real Linguist language name.
 *
 * There is deliberately NO --fix. A missing language can't be inferred correctly — the
 * block could be bash, text, json, or a diff, and stamping the wrong one is worse than
 * leaving it bare (it mis-highlights *and* lies to a screen reader). The fix is a human
 * choosing the right tag. This linter finds them; it won't guess.
 *
 * Because a plain-output block (command output, ASCII art) can legitimately have no
 * language, treat MD040 as a style/consistency check, not a hard defect — see the note
 * in examples/check-docs.sh on why it ships OFF by default there.
 *
 * Zero dependencies, Node built-ins only. Works on any Node >= 14.
 *
 * Usage:
 *   node fence-language-lint.js README.md                 # check one file
 *   node fence-language-lint.js README.md docs/*.md         # check several
 *   node fence-language-lint.js README.md --json            # machine-readable
 *   node fence-language-lint.js README.md --quiet           # only print problems
 *
 * Exit codes: 0 clean · 1 bare fences found · 2 usage/read error.
 */

'use strict';

const fs = require('fs');

function printHelp() {
  const lines = [
    'fence-language-lint.js — flag fenced code blocks with no language. (markdownlint MD040)',
    '',
    'Usage:',
    '  node fence-language-lint.js <file.md> [more.md ...] [options]',
    '',
    'Options:',
    '  --json    Emit a machine-readable report.',
    '  --quiet   Print only files with problems (suppress per-file OK line).',
    '  -h, --help  Show this help.',
    '',
    'No --fix: a missing language cannot be inferred safely — a human must pick the tag.',
    '',
    'Exit codes: 0 clean · 1 bare fences found · 2 usage/read error.',
  ];
  console.log(lines.join('\n'));
}

/**
 * Parse a possible fence line. Returns { marker:'`'|'~', info } or null.
 *   marker  the fence character
 *   info    everything after the marker run (the "info string"), verbatim
 *
 * Up to 3 leading spaces, then 3+ backticks or 3+ tildes (4+ leading spaces would be an
 * indented code block, not a fence — same cutoff as the sibling fence linters). A backtick
 * fence whose info string contains a backtick is NOT a valid fence opener in CommonMark, so
 * it returns null (it's a paragraph with inline code, not a code block).
 */
function parseFence(line) {
  const m = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m) return null;
  const marker = m[2][0];
  const info = m[3];
  if (marker === '`' && info.indexOf('`') !== -1) return null;
  return { marker, info };
}

/**
 * Lint one file's content. Returns an array of { line, rule:'MD040', kind, text }.
 * kind is always 'missing-language'.
 *
 * Only the OUTER fence pair matters — content between a matched open/close is code and is
 * never inspected (a stray ``` inside is part of the code, not a new fence). Only the
 * opening fence's info string is read; closing fences are never judged.
 */
function lintContent(content) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let marker = '';

  for (let i = 0; i < lines.length; i++) {
    const fence = parseFence(lines[i]);
    if (fence === null) continue;

    if (!inFence) {
      // Opening fence — this is the only place a language is required.
      if (fence.info.trim() === '') {
        findings.push({
          line: i + 1,
          rule: 'MD040',
          kind: 'missing-language',
          text: lines[i].trim(),
        });
      }
      inFence = true;
      marker = fence.marker;
    } else if (fence.marker === marker) {
      // Closing fence (same marker char) — never judged for a language.
      inFence = false;
      marker = '';
    }
    // A different fence char while inFence is just code content — ignore.
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
    console.error('fence-language-lint: no input files given.');
    process.exit(2);
  }

  const report = [];
  let totalFindings = 0;
  let hardError = false;

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (err) {
      hardError = true;
      if (!json) console.error(`fence-language-lint: cannot read ${file}: ${err.message}`);
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
        if (!quiet) console.log(`✓ ${entry.file} — every fenced block declares a language`);
        continue;
      }
      console.log(`✗ ${entry.file} — ${entry.findings.length} bare fence(s):`);
      for (const f of entry.findings) {
        console.log(`    ${entry.file}:${f.line}  [MD040] ${f.text || '```'}`);
        console.log('        opening fence has no language — add one (e.g. ```bash, ```json, ```text)');
      }
    }
  }

  if (hardError) process.exit(2);
  process.exit(totalFindings > 0 ? 1 : 0);
}

// Run only when invoked directly, so the functions can be require()'d and tested.
if (require.main === module) {
  main();
}

module.exports = { lintContent, parseFence };
