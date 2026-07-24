#!/usr/bin/env node
/**
 * code-fence-lint.js
 *
 * Lint fenced code blocks in Markdown files — the structural mistakes that wreck
 * how a README renders on GitHub. The classic one: an unclosed fence that turns the
 * entire rest of your document into a giant grey code block. This is the formatting
 * companion to the rest of the lint family (link-check.js, heading-lint.js,
 * frontmatter-lint.js): it tracks fenced blocks the same way they do, then reports
 * the ones that are broken.
 *
 * Checks (each rule can be toggled off):
 *
 *   1. unclosed-fence   A code fence that opens but never closes (an odd number of
 *                       matching fences). On GitHub this swallows everything after it
 *                       into one code block. ALWAYS an error.
 *   2. missing-language An opening ``` / ~~~ with no language identifier (```\n vs
 *                       ```js\n). No syntax highlighting, and many linters/renderers
 *                       prefer an explicit info string. WARNING by default — promote
 *                       to an error with --strict-language, silence with
 *                       --no-require-language.
 *   3. mismatched-fence A closing fence SHORTER than the one that opened the block,
 *                       where detectable. A block opened with ```` (4 backticks) is
 *                       only closed by 4+ backticks; a bare ``` inside it is content,
 *                       not a close. We flag the case where the block never closes
 *                       because the only candidate closers were too short. (Reported
 *                       as part of unclosed-fence with an explanatory message.)
 *
 * How fences are matched (CommonMark-aligned, pragmatically):
 *   - A fence is a line whose first non-space run is 3+ backticks OR 3+ tildes.
 *   - The opening fence's character (` or ~) and length set the block. A closing
 *     fence must use the SAME character and be AT LEAST as long, and carry no info
 *     string. This is what lets a ```` block legitimately contain ``` lines, and a
 *     ``` block legitimately contain ~~~ lines — they don't close each other.
 *   - Up to 3 leading spaces of indentation are allowed (CommonMark). This is what
 *     makes fences inside list items work; deeply-indented ``` inside an indented
 *     code context is a known limitation (see below).
 *   - Inline code (single/double backticks within a line, like `x`) is never a
 *     fence — only a line that STARTS (after ≤3 spaces) with the fence run counts.
 *
 * Known limitations (honest, not over-claimed):
 *   - No full CommonMark block parser. A ``` that is itself inside an *indented*
 *     (4-space) code block, or inside a blockquote with unusual nesting, may be
 *     read as a real fence. The common cases — top-level fences and fences inside
 *     list items — are handled correctly.
 *   - "Missing language" only inspects the OPENING fence's info string; it can't
 *     know whether a blank info string was intentional (e.g. plain text output).
 *     That's exactly why it's a warning, not an error, by default.
 *
 * Zero dependencies. Network-free. Works on any Node >= 14.
 *
 * Usage:
 *   node code-fence-lint.js README.md                    # lint one file
 *   node code-fence-lint.js README.md docs/*.md           # lint several
 *   node code-fence-lint.js README.md --json              # machine-readable report
 *   node code-fence-lint.js README.md --strict-language   # missing-language is an error
 *   node code-fence-lint.js README.md --no-require-language # don't report missing-language
 *   node code-fence-lint.js --help
 *
 * Exit codes (CI / pre-commit friendly):
 *   0  no problems (warnings alone do not fail the build)
 *   1  one or more errors found (unclosed/mismatched fences, or missing-language
 *      under --strict-language)
 *   2  usage error (no files, missing file, bad flag)
 */

'use strict';

const fs = require('fs');

function printHelp() {
  console.log(`code-fence-lint.js — lint fenced code blocks in Markdown

Usage:
  node code-fence-lint.js <file.md> [more.md ...] [options]

Options:
  --json                  Emit a JSON report instead of human-readable text.
  --quiet                 Only print files with problems (nothing on a clean file).
  --strict-language       Treat a missing language tag as an ERROR (fails the build),
                          not just a warning.
  --no-require-language   Don't report fences missing a language tag at all.
  --help                  Show this help.

Checks: unclosed-fence (error), missing-language (warning by default),
        mismatched-fence (error, reported via unclosed-fence).

Exit codes:
  0  clean (warnings alone do not fail)
  1  error(s) found
  2  usage error

Examples:
  node code-fence-lint.js README.md
  node code-fence-lint.js README.md docs/*.md --json
  node code-fence-lint.js README.md --strict-language`);
}

/**
 * Match a fence line. Returns null if the line is not a fence, otherwise
 * { char, len, info } where:
 *   char  '`' or '~'
 *   len   number of fence characters in the opening run
 *   info  the info string after the run, trimmed (language tag etc.)
 *
 * CommonMark: up to 3 leading spaces; the fence is a run of >= 3 identical
 * backticks or tildes. A backtick fence's info string may not itself contain a
 * backtick (that would be inline code, not a fence).
 */
function matchFence(line) {
  const m = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
  if (!m) return null;
  const run = m[2];
  const char = run[0];
  const info = m[3].trim();
  // A backtick info string containing a backtick isn't a valid opening fence.
  if (char === '`' && info.indexOf('`') !== -1) return null;
  return { char, len: run.length, info };
}

/**
 * Walk a Markdown document and report fenced-code-block problems.
 *
 * Returns an array of problem objects: { rule, severity, line, message }.
 *   rule      'unclosed-fence' | 'missing-language'
 *   severity  'error' | 'warning'
 *
 * `opts.requireLanguage` (default true) toggles missing-language reporting.
 * `opts.strictLanguage` (default false) makes missing-language an error.
 */
function lintFences(markdown, opts) {
  const o = Object.assign({ requireLanguage: true, strictLanguage: false }, opts);
  const lines = markdown.split('\n');
  const problems = [];

  // Active fence state: null when outside a code block, otherwise the open fence's
  // { char, len, info, line }.
  let open = null;

  for (let i = 0; i < lines.length; i++) {
    const fence = matchFence(lines[i]);
    if (!fence) continue;

    if (open === null) {
      // This fence OPENS a block.
      open = { char: fence.char, len: fence.len, info: fence.info, line: i + 1 };

      if (o.requireLanguage && fence.info === '') {
        const severity = o.strictLanguage ? 'error' : 'warning';
        problems.push({
          rule: 'missing-language',
          severity,
          line: i + 1,
          message: `Code fence opened with no language tag (${fence.char.repeat(fence.len)} with no info string). Add a language (e.g. \`${fence.char.repeat(fence.len)}js\`) for syntax highlighting.`,
        });
      }
      continue;
    }

    // We're inside a block. A line is a CLOSING fence only if it uses the SAME
    // character, is AT LEAST as long as the opener, and carries no info string.
    if (fence.char === open.char && fence.len >= open.len && fence.info === '') {
      open = null; // block closed cleanly
      continue;
    }
    // Otherwise this fence line is CONTENT of the open block (a shorter same-char
    // fence, a different-char fence, or a closer with a stray info string). Ignore.
  }

  // End of file with a block still open: unclosed.
  if (open !== null) {
    const opener = `${open.char.repeat(open.len)}${open.info ? ' ' + open.info : ''}`;
    let message = `Code fence opened at line ${open.line} (${opener.trim()}) is never closed before end of file. On GitHub this turns the rest of the document into one code block.`;
    if (open.len > 3) {
      message += ` Note: this block opened with ${open.len} ${open.char === '`' ? 'backticks' : 'tildes'}, so only a fence of ${open.len}+ ${open.char === '`' ? 'backticks' : 'tildes'} closes it — a shorter ${open.char.repeat(3)} inside it counts as content, not a close.`;
    }
    problems.push({
      rule: 'unclosed-fence',
      severity: 'error',
      line: open.line,
      message,
    });
  }

  return problems;
}

function parseArgs(argv) {
  const opts = {
    json: false,
    quiet: false,
    requireLanguage: true,
    strictLanguage: false,
    help: false,
  };
  const files = [];
  for (const arg of argv) {
    switch (arg) {
      case '--json': opts.json = true; break;
      case '--quiet': opts.quiet = true; break;
      case '--strict-language': opts.strictLanguage = true; opts.requireLanguage = true; break;
      case '--no-require-language': opts.requireLanguage = false; break;
      case '--help': case '-h': opts.help = true; break;
      default:
        if (arg.startsWith('-')) { opts.badFlag = arg; return { opts, files }; }
        files.push(arg);
    }
  }
  return { opts, files };
}

function main() {
  const { opts, files } = parseArgs(process.argv.slice(2));

  if (opts.help) { printHelp(); process.exit(0); }
  if (opts.badFlag) { console.error(`Unknown flag: ${opts.badFlag}\n`); printHelp(); process.exit(2); }
  if (files.length === 0) { console.error('Error: no Markdown files given.\n'); printHelp(); process.exit(2); }

  const report = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let usageError = false;

  for (const file of files) {
    let markdown;
    try {
      markdown = fs.readFileSync(file, 'utf8');
    } catch (e) {
      console.error(`Error: cannot read ${file} (${e.code || e.message})`);
      usageError = true;
      continue;
    }
    const problems = lintFences(markdown, opts);
    const errors = problems.filter((p) => p.severity === 'error').length;
    const warnings = problems.filter((p) => p.severity === 'warning').length;
    totalErrors += errors;
    totalWarnings += warnings;
    report.push({ file, problems, errors, warnings });
  }

  if (opts.json) {
    console.log(JSON.stringify({
      ok: totalErrors === 0 && !usageError,
      usageError,
      errors: totalErrors,
      warnings: totalWarnings,
      files: report,
    }, null, 2));
  } else {
    for (const { file, problems, errors, warnings } of report) {
      if (problems.length === 0) {
        if (!opts.quiet) console.log(`✓ ${file} — fenced code blocks OK`);
        continue;
      }
      const counts = [];
      if (errors) counts.push(`${errors} error(s)`);
      if (warnings) counts.push(`${warnings} warning(s)`);
      console.log(`✗ ${file} — ${counts.join(', ')}:`);
      for (const p of problems) {
        const tag = p.severity === 'error' ? 'error' : 'warn';
        console.log(`    [${tag}: ${p.rule}] line ${p.line}: ${p.message}`);
      }
    }
    if (!opts.quiet && totalErrors === 0 && totalWarnings === 0) {
      console.log('\nAll fenced code blocks check out.');
    } else if (totalErrors === 0 && totalWarnings > 0) {
      console.log(`\n${totalWarnings} warning(s), no errors.`);
    }
  }

  if (usageError) process.exit(2);
  process.exit(totalErrors === 0 ? 0 : 1);
}

if (require.main === module) main();

module.exports = { matchFence, lintFences };
