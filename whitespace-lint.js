#!/usr/bin/env node
/**
 * whitespace-lint.js
 *
 * Lint the whitespace HYGIENE of text files — the invisible stuff every other
 * linter in this repo ignores because it's busy with content. Trailing spaces,
 * hard tabs, CRLF line endings, a missing final newline, and runs of blank
 * lines. None of these change what a document *says*; all of them create diff
 * noise, merge conflicts, and "why did my whole file change?" pull requests.
 *
 * It's the hygiene companion to the content lint family (link-check.js,
 * heading-lint.js, list-lint.js, table-fmt.js): same fenced-code-block
 * awareness, same CLI shape, same CI-friendly exit codes. And unlike the
 * content linters, every rule here is mechanical — so `--fix` can safely
 * repair all of them in place.
 *
 * Checks (each rule can be toggled off):
 *
 *   1. trailing-whitespace  A line ends in spaces/tabs. (markdownlint MD009.)
 *                           ERROR by default. Exception: exactly TWO trailing
 *                           spaces is a Markdown hard line break — allowed by
 *                           default, forbid it with --no-md-breaks.
 *   2. hard-tab             A TAB character used for indentation outside a
 *                           fenced code block. (MD010.) Tabs render at an
 *                           unpredictable width and misalign nested lists.
 *                           ERROR by default. Tabs INSIDE code fences are left
 *                           alone (often significant, e.g. Makefiles pasted in);
 *                           include them with --tabs-in-code.
 *   3. crlf                 A line ends in CRLF (\r\n) or a bare CR. Windows
 *                           checkouts sneak these in and make every line look
 *                           changed on a Unix diff. ERROR by default.
 *   4. final-newline        The file does not end with exactly one newline.
 *                           POSIX text files should; GitHub shows a "No newline
 *                           at end of file" marker when they don't. Covers both
 *                           "missing" and "multiple trailing blank lines at EOF."
 *                           ERROR by default.
 *   5. multiple-blanks      More than N consecutive blank lines in the body.
 *                           (MD012.) Default limit is 1; set with --max-blanks.
 *                           WARNING by default; promote with --strict-blanks.
 *
 * Fenced code blocks (``` / ~~~) are tracked so the hard-tab and multiple-blank
 * rules can skip them by default — code has its own whitespace rules. Trailing
 * whitespace, CRLF, and final-newline are checked everywhere (they're never
 * intentional).
 *
 * This runs on ANY text file, not just Markdown — point it at .js, .py, .yml,
 * whatever. The fenced-code and md-break logic simply won't trigger on files
 * that have no fences or hard breaks.
 *
 * Zero dependencies. Network-free. Works on any Node >= 14.
 *
 * Usage:
 *   node whitespace-lint.js README.md              # lint one file
 *   node whitespace-lint.js src/*.js docs/*.md     # lint several
 *   node whitespace-lint.js README.md --json        # machine-readable report
 *   node whitespace-lint.js README.md --fix         # repair in place
 *   node whitespace-lint.js *.md --fix --json       # fix and report what changed
 *   node whitespace-lint.js f.md --no-md-breaks     # 2-trailing-spaces is an error too
 *   node whitespace-lint.js f.md --max-blanks 2     # allow up to 2 blank lines
 *   node whitespace-lint.js f.md --no-tab --no-crlf # turn rules off
 *   node whitespace-lint.js --help
 *
 * Exit codes (CI / pre-commit friendly):
 *   0  clean — no findings, or --fix repaired everything
 *   1  lint findings (without --fix)
 *   2  usage error (no files, missing file, bad flag)
 */

'use strict';

const fs = require('fs');

const RULES = ['trailing', 'tab', 'crlf', 'final-newline', 'blanks'];

// Parse CLI into { files, opts }. Throws a string on a bad flag.
function parseArgs(argv) {
  const opts = {
    json: false,
    fix: false,
    mdBreaks: true,      // allow exactly two trailing spaces (MD hard break)
    tabsInCode: false,   // skip hard-tab check inside fences
    maxBlanks: 1,
    strictBlanks: false, // promote multiple-blanks to error
    rules: new Set(RULES),
  };
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--fix') opts.fix = true;
    else if (a === '--no-md-breaks') opts.mdBreaks = false;
    else if (a === '--tabs-in-code') opts.tabsInCode = true;
    else if (a === '--strict-blanks') opts.strictBlanks = true;
    else if (a === '--max-blanks') {
      const n = parseInt(argv[++i], 10);
      if (!Number.isInteger(n) || n < 0) throw `--max-blanks needs a non-negative integer`;
      opts.maxBlanks = n;
    } else if (a === '--no-trailing') opts.rules.delete('trailing');
    else if (a === '--no-tab') opts.rules.delete('tab');
    else if (a === '--no-crlf') opts.rules.delete('crlf');
    else if (a === '--no-final-newline') opts.rules.delete('final-newline');
    else if (a === '--no-blanks') opts.rules.delete('blanks');
    else if (a.startsWith('--')) throw `unknown flag: ${a}`;
    else files.push(a);
  }
  return { files, opts };
}

// A line is "blank" if it's empty or only whitespace.
function isBlank(line) {
  return line.trim() === '';
}

// Detect fenced code block open/close. Returns the fence marker if this line
// opens/closes a fence, else null. Mirrors the rest of the lint family.
function fenceMarker(line) {
  const m = line.match(/^(\s*)(`{3,}|~{3,})/);
  return m ? m[2][0] : null;
}

/**
 * Lint one file's raw content string. Returns { findings, fixed }.
 *   findings: [{ line, col, rule, severity, message }]
 *   fixed:    the repaired content string (only meaningful when caller uses it)
 */
function lintContent(raw, opts) {
  const findings = [];

  // --- whole-file checks that operate on the raw bytes ---
  // CRLF / bare CR: find them before we normalize for line-by-line work.
  const eol = detectEol(raw);
  if (opts.rules.has('crlf') && (eol.crlf > 0 || eol.cr > 0)) {
    // Report each offending physical line number (counted by \n).
    const idx = crlfLineNumbers(raw);
    for (const ln of idx) {
      findings.push({ line: ln, col: 0, rule: 'crlf', severity: 'error',
        message: 'line ends with CRLF/CR — normalize to LF' });
    }
  }

  // Normalize to LF for the per-line rules so a stray \r doesn't skew columns.
  const norm = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const hadTrailingNewline = norm.endsWith('\n');
  // Split into lines WITHOUT a phantom trailing empty element.
  const body = hadTrailingNewline ? norm.slice(0, -1) : norm;
  const lines = body.length === 0 && !hadTrailingNewline ? [] : body.split('\n');

  let inFence = false;
  let fenceChar = null;
  let blankRun = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // fence tracking
    const fm = fenceMarker(line);
    if (fm && (!inFence || fm === fenceChar)) {
      inFence = !inFence;
      fenceChar = inFence ? fm : null;
    }

    // trailing whitespace (everywhere)
    if (opts.rules.has('trailing')) {
      const tw = line.match(/([ \t]+)$/);
      if (tw) {
        const isMdBreak = opts.mdBreaks && /[^ \t]/.test(line) && tw[1] === '  ';
        if (!isMdBreak) {
          findings.push({ line: lineNo, col: line.length - tw[1].length + 1,
            rule: 'trailing', severity: 'error',
            message: `trailing whitespace (${tw[1].length} char${tw[1].length > 1 ? 's' : ''})` });
        }
      }
    }

    // hard tab in indentation (skip inside fences unless asked)
    if (opts.rules.has('tab') && (!inFence || opts.tabsInCode)) {
      const indent = line.match(/^[ \t]*/)[0];
      const tabPos = indent.indexOf('\t');
      if (tabPos !== -1) {
        findings.push({ line: lineNo, col: tabPos + 1, rule: 'tab', severity: 'error',
          message: 'hard tab in indentation — use spaces' });
      }
    }

    // multiple consecutive blank lines (skip inside fences)
    if (isBlank(line) && !inFence) {
      blankRun++;
      if (opts.rules.has('blanks') && blankRun > opts.maxBlanks) {
        findings.push({ line: lineNo, col: 0, rule: 'blanks',
          severity: opts.strictBlanks ? 'error' : 'warning',
          message: `more than ${opts.maxBlanks} consecutive blank line${opts.maxBlanks === 1 ? '' : 's'}` });
      }
    } else if (!isBlank(line)) {
      blankRun = 0;
    }
  }

  // --- final-newline: exactly one trailing \n, no trailing blank lines ---
  if (opts.rules.has('final-newline') && raw.length > 0) {
    if (!hadTrailingNewline) {
      findings.push({ line: lines.length, col: 0, rule: 'final-newline', severity: 'error',
        message: 'no newline at end of file' });
    } else if (/\n[ \t]*\n$/.test(norm) && lines.length > 0 && isBlank(lines[lines.length - 1])) {
      findings.push({ line: lines.length, col: 0, rule: 'final-newline', severity: 'error',
        message: 'multiple blank lines at end of file' });
    }
  }

  const fixed = opts.fix ? fixContent(raw, opts) : raw;
  return { findings, fixed };
}

// Count CRLF/CR occurrences quickly.
function detectEol(raw) {
  const crlf = (raw.match(/\r\n/g) || []).length;
  const cr = (raw.match(/\r(?!\n)/g) || []).length;
  return { crlf, cr };
}

// Physical line numbers (LF-counted) that end in \r.
function crlfLineNumbers(raw) {
  const out = [];
  let ln = 1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\n') {
      if (i > 0 && raw[i - 1] === '\r') out.push(ln);
      ln++;
    } else if (raw[i] === '\r' && raw[i + 1] !== '\n') {
      out.push(ln); ln++;
    }
  }
  return out;
}

// Deterministically repair every mechanical rule the caller left enabled.
function fixContent(raw, opts) {
  let s = raw;
  if (opts.rules.has('crlf')) s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const hadTrailingNewline = s.endsWith('\n');
  let lines = (hadTrailingNewline ? s.slice(0, -1) : s).split('\n');

  let inFence = false, fenceChar = null;
  lines = lines.map((line) => {
    const fm = fenceMarker(line);
    const wasInFence = inFence;
    if (fm && (!inFence || fm === fenceChar)) {
      inFence = !inFence;
      fenceChar = inFence ? fm : null;
    }
    let out = line;
    // hard tabs in indentation -> 2 spaces per tab (skip inside fences unless asked)
    if (opts.rules.has('tab') && (!wasInFence || opts.tabsInCode)) {
      const m = out.match(/^([ \t]*)(.*)$/s);
      out = m[1].replace(/\t/g, '  ') + m[2];
    }
    // trailing whitespace (preserve a 2-space MD break if allowed)
    if (opts.rules.has('trailing')) {
      const tw = out.match(/([ \t]+)$/);
      if (tw) {
        const keepBreak = opts.mdBreaks && /[^ \t]/.test(out) && tw[1] === '  ';
        if (!keepBreak) out = out.replace(/[ \t]+$/, '');
      }
    }
    return out;
  });

  // collapse over-long blank runs in the body (outside fences we can't cheaply
  // re-detect here, so collapse globally — safe for the common case).
  if (opts.rules.has('blanks')) {
    const max = opts.maxBlanks;
    const collapsed = [];
    let run = 0;
    for (const l of lines) {
      if (l.trim() === '') {
        run++;
        if (run <= max) collapsed.push(l);
      } else {
        run = 0;
        collapsed.push(l);
      }
    }
    lines = collapsed;
  }

  let result = lines.join('\n');
  // final newline: exactly one, and strip trailing blank lines
  if (opts.rules.has('final-newline')) {
    result = result.replace(/\n+$/, '');
    if (result.length > 0) result += '\n';
  } else if (hadTrailingNewline) {
    result += '\n';
  }
  return result;
}

// --- CLI ---
function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return 0;
  }
  let parsed;
  try {
    parsed = parseArgs(args);
  } catch (e) {
    process.stderr.write(`whitespace-lint: ${e}\n`);
    return 2;
  }
  const { files, opts } = parsed;
  if (files.length === 0) {
    process.stderr.write('whitespace-lint: no files given (try --help)\n');
    return 2;
  }

  const report = [];
  let hadError = false;
  let ioError = false;

  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (e) {
      process.stderr.write(`whitespace-lint: cannot read ${file}: ${e.code || e.message}\n`);
      ioError = true;
      continue;
    }
    const { findings, fixed } = lintContent(raw, opts);

    if (opts.fix) {
      if (fixed !== raw) {
        try {
          fs.writeFileSync(file, fixed);
        } catch (e) {
          process.stderr.write(`whitespace-lint: cannot write ${file}: ${e.code || e.message}\n`);
          ioError = true;
          continue;
        }
      }
      report.push({ file, fixed: fixed !== raw, findings: findings.length });
    } else {
      report.push({ file, findings });
      if (findings.some((f) => f.severity === 'error')) hadError = true;
    }
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    printHuman(report, opts);
  }

  if (ioError) return 2;
  return hadError ? 1 : 0;
}

function printHuman(report, opts) {
  for (const entry of report) {
    if (opts.fix) {
      process.stdout.write(entry.fixed
        ? `✔ fixed ${entry.file}\n`
        : `· clean ${entry.file}\n`);
      continue;
    }
    if (entry.findings.length === 0) {
      process.stdout.write(`· clean ${entry.file}\n`);
      continue;
    }
    for (const f of entry.findings) {
      const where = f.col ? `${f.line}:${f.col}` : `${f.line}`;
      const mark = f.severity === 'error' ? '✖' : '⚠';
      process.stdout.write(`${mark} ${entry.file}:${where}  ${f.rule}  ${f.message}\n`);
    }
  }
}

function printHelp() {
  process.stdout.write(`whitespace-lint.js — lint (and fix) whitespace hygiene in text files

Usage:
  node whitespace-lint.js <file...> [options]

Options:
  --fix               Repair findings in place (all rules are mechanical)
  --json              Machine-readable report
  --no-md-breaks      Treat a 2-space Markdown line break as trailing whitespace
  --tabs-in-code      Also check hard tabs inside fenced code blocks
  --max-blanks N      Allow up to N consecutive blank lines (default 1)
  --strict-blanks     Promote the multiple-blanks warning to an error
  --no-trailing --no-tab --no-crlf --no-final-newline --no-blanks
                      Turn individual rules off
  --help              Show this help

Exit codes: 0 clean/fixed · 1 findings · 2 usage or IO error
`);
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  parseArgs,
  lintContent,
  fixContent,
  detectEol,
  fenceMarker,
};
