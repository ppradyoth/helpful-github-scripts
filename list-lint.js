#!/usr/bin/env node
/**
 * list-lint.js
 *
 * Lint Markdown LIST consistency — the rendering and diff-noise problems that come
 * from mixing bullet styles, botching an ordered sequence, or indenting a nested
 * item by an odd number of spaces. This is the list-focused companion to the rest
 * of the zero-dep lint family in this repo (link-check.js, heading-lint.js,
 * code-fence-lint.js, table-fmt.js): same fence-skipping, same CLI shape, same
 * CI-friendly exit codes.
 *
 * Checks (each rule can be toggled off):
 *
 *   1. inconsistent-bullet  Within one list block, unordered items at the SAME
 *                           indent level mix markers (`-`, `*`, `+`). The first
 *                           marker seen at a level sets the expected marker; any
 *                           sibling using a different one is flagged. Mixed markers
 *                           render fine but read as sloppy and churn diffs when a
 *                           formatter later normalizes them. (markdownlint MD004.)
 *                           ERROR by default.
 *   2. ordered-numbering    An ordered list whose numbers are neither "all 1." (the
 *                           lazy style GitHub renumbers for you) NOR a clean
 *                           incrementing run from its start (1,2,3… or 0,1,2…). A
 *                           list that goes 1,2,4 or 1,3,2 is almost always a
 *                           hand-edit that dropped or duplicated a step. (MD029.)
 *                           ERROR by default.
 *   3. odd-indent           A list item indented by an ODD number of spaces (1, 3,
 *                           5…). Nested list markers should line up on an even step
 *                           (2 or 4 spaces); an odd indent is a near-certain typo
 *                           that can flip a nested item into a sibling — or into a
 *                           continuation paragraph — depending on the renderer.
 *                           (Related to MD005/MD007.) WARNING by default; promote
 *                           with --strict-indent, silence with --no-indent.
 *
 * What a "list block" is (pragmatic, documented):
 *   A maximal run of lines that isn't broken by a non-blank, ZERO-indent line that
 *   is not itself a list item. Blank lines (loose lists) and indented continuation
 *   text stay inside the block. Fenced code blocks (``` / ~~~) are tracked and
 *   skipped entirely, so a `-` inside a code sample is never treated as a bullet.
 *
 * Honest limitations (not over-claimed):
 *   - No full CommonMark list parser. Marker consistency and numbering are keyed by
 *     leading-space width, which is the common case; exotic nesting inside
 *     blockquotes or 4-space indented code may be read loosely.
 *   - "Ordered start" is taken from the first item's number, so a list that
 *     deliberately starts at 5 and increments (5,6,7) is accepted.
 *   - Marker consistency is scoped to a single list block, not the whole file, so a
 *     repo that uses `-` in one section and `*` in another is not penalized — only
 *     mixing WITHIN one list is.
 *
 * Zero dependencies. Network-free. Works on any Node >= 14.
 *
 * Usage:
 *   node list-lint.js README.md                 # lint one file
 *   node list-lint.js docs/*.md                 # lint several
 *   node list-lint.js README.md --json          # machine-readable report
 *   node list-lint.js README.md --strict-indent # odd-indent becomes an error
 *   node list-lint.js README.md --no-indent     # don't run the indent check
 *   node list-lint.js README.md --no-bullet --no-ordered   # turn rules off
 *   node list-lint.js --help
 *
 * Exit codes (CI / pre-commit friendly):
 *   0  no errors (warnings may be present)
 *   1  at least one error-level problem found
 *   2  usage / file-read error
 *
 * Also require()-able:
 *   const { lintText } = require('./list-lint.js');
 *   const problems = lintText(markdownString, { indent: 'warn' });
 */

'use strict';

const fs = require('fs');

// ---- rule severities -------------------------------------------------------

const DEFAULTS = {
  bullet: 'error',   // inconsistent-bullet
  ordered: 'error',  // ordered-numbering
  indent: 'warn',    // odd-indent
};

// A list-item line: up to any indentation, then a marker, then whitespace, then
// content. Marker is `-`/`*`/`+` (unordered) or digits followed by `.`/`)` (ordered).
const ITEM_RE = /^(\s*)([-*+]|(\d{1,9})[.)])\s+(\S.*)?$/;

// ---- core linter -----------------------------------------------------------

/**
 * Lint the list structure of a Markdown string.
 * @param {string} text
 * @param {object} [opts] severities per rule: {bullet, ordered, indent} each
 *                        'error' | 'warn' | 'off'
 * @returns {Array<{line:number, rule:string, severity:string, message:string}>}
 */
function lintText(text, opts) {
  const sev = Object.assign({}, DEFAULTS, opts || {});
  const lines = text.split(/\r?\n/);
  const problems = [];

  // Pass 1: mark which lines are inside a fenced code block so we skip them.
  const inFence = new Array(lines.length).fill(false);
  let fenceChar = null; // '`' or '~'
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceChar === null) {
      if (m) {
        fenceChar = m[1][0];
        fenceLen = m[1].length;
        inFence[i] = true; // the opening fence line itself is "in fence"
      }
    } else {
      inFence[i] = true;
      // A closing fence: same char, >= length, no trailing info string.
      const cm = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (cm && cm[1][0] === fenceChar && cm[1].length >= fenceLen) {
        fenceChar = null;
        fenceLen = 0;
      }
    }
  }

  // Pass 2: walk lines, gather list blocks, lint each block.
  let block = null; // { items: [{line, indent, ordered, marker, num}] }

  const flushBlock = () => {
    if (block && block.items.length) lintBlock(block, sev, problems);
    block = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (inFence[i]) { flushBlock(); continue; }

    const m = raw.match(ITEM_RE);
    if (m) {
      const indent = m[1].length;
      const markerTok = m[2];
      const ordered = /\d/.test(markerTok);
      if (!block) block = { items: [] };
      block.items.push({
        line: i + 1,
        indent,
        ordered,
        marker: ordered ? markerTok[markerTok.length - 1] : markerTok, // '.'/')' or '-'/'*'/'+'
        num: ordered ? parseInt(m[3], 10) : null,
      });
      continue;
    }

    // Not a list item. Decide whether it breaks the current block.
    if (raw.trim() === '') continue;          // blank line: loose list, keep block open
    if (/^\s+\S/.test(raw)) continue;         // indented continuation text, keep block open
    flushBlock();                             // zero-indent, non-list, non-blank → block ends
  }
  flushBlock();

  problems.sort((a, b) => a.line - b.line);
  return problems;
}

// Lint one gathered list block.
function lintBlock(block, sev, problems) {
  const items = block.items;

  // --- odd-indent (per item) ---
  if (sev.indent !== 'off') {
    for (const it of items) {
      if (it.indent % 2 === 1) {
        problems.push({
          line: it.line,
          rule: 'odd-indent',
          severity: sev.indent,
          message: `list item indented by ${it.indent} space${it.indent === 1 ? '' : 's'} (odd); use an even step (2 or 4)`,
        });
      }
    }
  }

  // --- inconsistent-bullet (unordered, per indent level) ---
  if (sev.bullet !== 'off') {
    const expected = new Map(); // indent -> first unordered marker seen
    for (const it of items) {
      if (it.ordered) continue;
      if (!expected.has(it.indent)) {
        expected.set(it.indent, it.marker);
      } else if (expected.get(it.indent) !== it.marker) {
        problems.push({
          line: it.line,
          rule: 'inconsistent-bullet',
          severity: sev.bullet,
          message: `bullet marker '${it.marker}' differs from '${expected.get(it.indent)}' used earlier in this list`,
        });
      }
    }
  }

  // --- ordered-numbering (per indent level) ---
  if (sev.ordered !== 'off') {
    // Group consecutive ordered items by indent level, in document order.
    const groups = new Map(); // indent -> [items]
    for (const it of items) {
      if (!it.ordered) continue;
      if (!groups.has(it.indent)) groups.set(it.indent, []);
      groups.get(it.indent).push(it);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue; // a single ordered item can't be inconsistent
      const nums = group.map((g) => g.num);
      const allOnes = nums.every((n) => n === nums[0] && n <= 1); // all 0 or all 1
      let incrementing = true;
      for (let k = 1; k < nums.length; k++) {
        if (nums[k] !== nums[0] + k) { incrementing = false; break; }
      }
      if (allOnes || incrementing) continue;
      // Report the first item that breaks the incrementing sequence.
      for (let k = 1; k < nums.length; k++) {
        if (nums[k] !== nums[0] + k) {
          problems.push({
            line: group[k].line,
            rule: 'ordered-numbering',
            severity: sev.ordered,
            message: `ordered item is ${nums[k]}. — expected ${nums[0] + k}. (or use all "1." lazy numbering)`,
          });
          break;
        }
      }
    }
  }
}

// ---- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const files = [];
  const opts = { json: false, quiet: false, sev: Object.assign({}, DEFAULTS) };
  for (const a of argv) {
    switch (a) {
      case '--help':
      case '-h': opts.help = true; break;
      case '--json': opts.json = true; break;
      case '--quiet': opts.quiet = true; break;
      case '--no-bullet': opts.sev.bullet = 'off'; break;
      case '--no-ordered': opts.sev.ordered = 'off'; break;
      case '--no-indent': opts.sev.indent = 'off'; break;
      case '--strict-indent': opts.sev.indent = 'error'; break;
      default:
        if (a.startsWith('-')) { opts.badFlag = a; }
        else files.push(a);
    }
  }
  opts.files = files;
  return opts;
}

const HELP = `list-lint.js — lint Markdown list consistency (zero dependencies)

Usage:
  node list-lint.js <file.md> [more.md …] [options]

Checks:
  inconsistent-bullet  mixed -/*/+ markers within one list      (error)
  ordered-numbering    ordered list not 1,2,3… and not all 1.   (error)
  odd-indent           list item indented an odd # of spaces     (warn)

Options:
  --json            machine-readable report
  --quiet           print only problems (no per-file "ok" lines)
  --no-bullet       disable the inconsistent-bullet check
  --no-ordered      disable the ordered-numbering check
  --no-indent       disable the odd-indent check
  --strict-indent   treat odd-indent as an error (affects exit code)
  -h, --help        this help

Exit codes: 0 = no errors, 1 = errors found, 2 = usage/read error`;

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); process.exit(0); }
  if (opts.badFlag) { console.error(`Unknown option: ${opts.badFlag}\n`); console.error(HELP); process.exit(2); }
  if (opts.files.length === 0) { console.error('No files given.\n'); console.error(HELP); process.exit(2); }

  const report = [];
  let errorCount = 0;
  let warnCount = 0;
  let readError = false;

  for (const file of opts.files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      console.error(`Cannot read ${file}: ${e.message}`);
      readError = true;
      continue;
    }
    const problems = lintText(text, opts.sev);
    for (const p of problems) {
      if (p.severity === 'error') errorCount++;
      else if (p.severity === 'warn') warnCount++;
    }
    report.push({ file, problems });
  }

  if (opts.json) {
    console.log(JSON.stringify({ report, errorCount, warnCount }, null, 2));
  } else {
    for (const { file, problems } of report) {
      if (problems.length === 0) {
        if (!opts.quiet) console.log(`✓ ${file}`);
        continue;
      }
      console.log(`✗ ${file}`);
      for (const p of problems) {
        const tag = p.severity === 'error' ? 'error' : 'warn ';
        console.log(`  ${tag} ${file}:${p.line}  [${p.rule}] ${p.message}`);
      }
    }
    if (!opts.quiet) {
      const parts = [];
      parts.push(`${errorCount} error${errorCount === 1 ? '' : 's'}`);
      parts.push(`${warnCount} warning${warnCount === 1 ? '' : 's'}`);
      console.log(`\n${parts.join(', ')}.`);
    }
  }

  if (readError) process.exit(2);
  process.exit(errorCount > 0 ? 1 : 0);
}

if (require.main === module) main();

module.exports = { lintText };
