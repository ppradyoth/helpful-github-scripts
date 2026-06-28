#!/usr/bin/env node
/**
 * heading-lint.js
 *
 * Lint the heading STRUCTURE of Markdown files — the problems that quietly break
 * a README's table of contents and in-page anchors. It's the upstream companion
 * to link-check.js: link-check tells you a `#anchor` is broken; this tells you
 * WHY — usually a duplicate heading or a missing level the slugger mangled.
 *
 * Checks (each can be toggled off):
 *
 *   1. duplicate-slug   Two headings that produce the SAME GitHub anchor slug.
 *                       GitHub disambiguates the second as `name-1`, so a
 *                       [link](#name) silently lands on the wrong one — or your
 *                       hand-written TOC points at an anchor that moved. This is
 *                       the single most common cause of a "link looks right but
 *                       jumps to the wrong place" bug.
 *   2. skipped-level    A jump like H2 -> H4 (skipping H3). Breaks document
 *                       outline / accessibility and most TOC generators.
 *   3. multiple-h1      More than one H1 in a file. A README should have exactly
 *                       one title. (Toggle with --allow-multiple-h1.)
 *   4. no-h1            File has no H1 at all. (Toggle with --no-require-h1.)
 *   5. empty-heading    A heading marker with no text (`## `).
 *   6. first-not-h1     The first heading isn't an H1 (starts at H2+). Off by
 *                       default for non-README docs; enable with --require-h1.
 *
 * It uses the SAME slug algorithm and the SAME code-fence skipping as
 * markdown-toc.js / link-check.js, so its idea of "duplicate anchor" matches
 * exactly what those tools (and GitHub) compute.
 *
 * Zero dependencies. Works on any Node >= 14.
 *
 * Usage:
 *   node heading-lint.js README.md                   # lint one file
 *   node heading-lint.js README.md docs/*.md          # lint several
 *   node heading-lint.js README.md --json             # machine-readable report
 *   node heading-lint.js docs/page.md --no-require-h1 # don't flag missing H1
 *   node heading-lint.js README.md --allow-multiple-h1
 *   node heading-lint.js --help
 *
 * Exit codes (CI / pre-commit friendly):
 *   0  no heading problems
 *   1  one or more problems found
 *   2  usage error (no files, missing file, bad flag)
 */

'use strict';

const fs = require('fs');

function printHelp() {
  console.log(`heading-lint.js — lint Markdown heading structure

Usage:
  node heading-lint.js <file.md> [more.md ...] [options]

Options:
  --json                Emit a JSON report instead of human-readable text.
  --quiet               Only print problems (nothing on a clean file).
  --require-h1          Require the FIRST heading to be an H1 (default: only
                        require that an H1 exists somewhere).
  --no-require-h1       Don't require an H1 at all (good for partial/included docs).
  --allow-multiple-h1   Don't flag a file that has more than one H1.
  --help                Show this help.

Checks: duplicate-slug, skipped-level, multiple-h1, no-h1, empty-heading,
        first-not-h1 (only with --require-h1).

Exit codes:
  0  clean
  1  problem(s) found
  2  usage error

Examples:
  node heading-lint.js README.md
  node heading-lint.js README.md docs/*.md --json
  node heading-lint.js CHANGELOG.md --no-require-h1`);
}

/**
 * GitHub's anchor-slug algorithm — identical to markdown-toc.js / link-check.js:
 * lowercase, strip anything that isn't a word char / space / hyphen, spaces -> hyphens
 * (no run-collapsing), then disambiguate duplicates as base, base-1, base-2, ...
 */
function slugify(text, seen) {
  let slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/ /g, '-');
  const base = slug;
  const n = seen.get(base) || 0;
  if (n > 0) slug = `${base}-${n}`;
  seen.set(base, n + 1);
  return slug;
}

/** Strip inline markdown so the displayed heading text is clean for slugging. */
function cleanText(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [label](url) -> label
    .replace(/[`*_~]/g, '') // code/bold/italic markers
    .trim();
}

/**
 * Extract ATX headings, skipping fenced code blocks (``` or ~~~).
 * Returns [{ level, text, line }] (line is 1-based).
 */
function extractHeadings(markdown) {
  const lines = markdown.split('\n');
  const headings = [];
  let fence = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const h = line.match(/^(#{1,6})(\s+.*?)?\s*#*\s*$/);
    if (!h) continue;
    const level = h[1].length;
    const text = (h[2] || '').trim();
    headings.push({ level, text, line: i + 1 });
  }
  return headings;
}

/**
 * Lint one file's heading list. Returns an array of problem objects:
 * { rule, line, level, text, message }.
 */
function lintHeadings(markdown, opts) {
  const o = Object.assign(
    { requireH1: true, firstMustBeH1: false, allowMultipleH1: false },
    opts
  );
  const headings = extractHeadings(markdown);
  const problems = [];
  const seenSlug = new Map(); // base-slug -> count, mirrors GitHub's slugger
  const slugFirstSeen = new Map(); // base-slug -> first heading that produced it

  let h1Count = 0;
  let prevLevel = null;

  headings.forEach((h, idx) => {
    // empty-heading
    if (!h.text) {
      problems.push({
        rule: 'empty-heading',
        line: h.line,
        level: h.level,
        text: '',
        message: `Empty H${h.level} heading (marker with no text)`,
      });
      return; // nothing else to check on an empty heading
    }

    const display = cleanText(h.text);

    // duplicate-slug — compute the base slug the way GitHub does, before suffixing
    const base = display
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/ /g, '-');
    if (slugFirstSeen.has(base)) {
      const first = slugFirstSeen.get(base);
      problems.push({
        rule: 'duplicate-slug',
        line: h.line,
        level: h.level,
        text: display,
        message: `Duplicate heading slug "#${base}" (first used at line ${first.line}: "${first.text}"). GitHub will rename this anchor to "#${base}-${seenSlug.get(base)}" — links to "#${base}" may resolve to the wrong heading.`,
      });
    } else {
      slugFirstSeen.set(base, { line: h.line, text: display });
    }
    slugify(display, seenSlug); // advance the disambiguation counter

    // h1 bookkeeping
    if (h.level === 1) h1Count++;

    // first-not-h1
    if (idx === 0 && o.firstMustBeH1 && h.level !== 1) {
      problems.push({
        rule: 'first-not-h1',
        line: h.line,
        level: h.level,
        text: display,
        message: `First heading is H${h.level}, expected H1`,
      });
    }

    // skipped-level (only on the way DOWN; jumping back up any number of levels is fine)
    if (prevLevel !== null && h.level > prevLevel + 1) {
      problems.push({
        rule: 'skipped-level',
        line: h.line,
        level: h.level,
        text: display,
        message: `Heading level jumps from H${prevLevel} to H${h.level} (skips H${prevLevel + 1})`,
      });
    }
    prevLevel = h.level;
  });

  // multiple-h1
  if (!o.allowMultipleH1 && h1Count > 1) {
    const firstExtra = headings.filter((h) => h.level === 1)[1];
    problems.push({
      rule: 'multiple-h1',
      line: firstExtra ? firstExtra.line : 1,
      level: 1,
      text: firstExtra ? cleanText(firstExtra.text) : '',
      message: `File has ${h1Count} H1 headings; expected exactly one title`,
    });
  }

  // no-h1
  if (o.requireH1 && h1Count === 0) {
    problems.push({
      rule: 'no-h1',
      line: 1,
      level: 0,
      text: '',
      message: 'File has no H1 heading (no top-level title)',
    });
  }

  return problems;
}

function parseArgs(argv) {
  const opts = {
    json: false,
    quiet: false,
    requireH1: true,
    firstMustBeH1: false,
    allowMultipleH1: false,
    help: false,
  };
  const files = [];
  for (const arg of argv) {
    switch (arg) {
      case '--json': opts.json = true; break;
      case '--quiet': opts.quiet = true; break;
      case '--require-h1': opts.firstMustBeH1 = true; opts.requireH1 = true; break;
      case '--no-require-h1': opts.requireH1 = false; opts.firstMustBeH1 = false; break;
      case '--allow-multiple-h1': opts.allowMultipleH1 = true; break;
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
  let totalProblems = 0;
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
    const problems = lintHeadings(markdown, opts);
    totalProblems += problems.length;
    report.push({ file, problems });
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: totalProblems === 0 && !usageError, usageError, files: report }, null, 2));
  } else {
    for (const { file, problems } of report) {
      if (problems.length === 0) {
        if (!opts.quiet) console.log(`✓ ${file} — heading structure clean`);
        continue;
      }
      console.log(`✗ ${file} — ${problems.length} problem(s):`);
      for (const p of problems) {
        const where = p.line ? `line ${p.line}` : '—';
        console.log(`    [${p.rule}] ${where}: ${p.message}`);
      }
    }
    if (!opts.quiet && totalProblems === 0) console.log('\nAll heading checks passed.');
  }

  if (usageError) process.exit(2);
  process.exit(totalProblems === 0 ? 0 : 1);
}

if (require.main === module) main();

module.exports = { slugify, cleanText, extractHeadings, lintHeadings };
