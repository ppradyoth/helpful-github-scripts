#!/usr/bin/env node
/**
 * markdown-toc.js
 *
 * Generate a GitHub-flavored table of contents from a Markdown file's headings.
 *
 * - Parses ATX headings (`#`, `##`, ...), ignoring anything inside fenced code blocks.
 * - Builds GitHub-compatible anchor slugs (lowercase, spaces -> hyphens, punctuation
 *   stripped, duplicate slugs disambiguated with -1, -2, ...).
 * - Prints the TOC to stdout, or with --write injects/updates it between
 *   <!-- TOC --> and <!-- /TOC --> markers in the file.
 *
 * Zero dependencies. Works on any Node >= 14.
 *
 * Usage:
 *   node markdown-toc.js README.md                 # print TOC to stdout
 *   node markdown-toc.js README.md --write         # update TOC block in the file
 *   node markdown-toc.js README.md --min-level 2 --max-level 3
 *   node markdown-toc.js --help
 */

'use strict';

const fs = require('fs');

const START_MARKER = '<!-- TOC -->';
const END_MARKER = '<!-- /TOC -->';

function printHelp() {
  console.log(`markdown-toc.js — generate a GitHub-style table of contents

Usage:
  node markdown-toc.js <file.md> [options]

Options:
  --write              Inject/update the TOC between ${START_MARKER} and ${END_MARKER}
                       markers in the file (added near the top if no markers exist).
  --min-level <n>      Shallowest heading level to include (default: 2 — skips the H1 title).
  --max-level <n>      Deepest heading level to include (default: 4).
  --help               Show this help.

Examples:
  node markdown-toc.js README.md
  node markdown-toc.js README.md --write
  node markdown-toc.js docs/guide.md --min-level 2 --max-level 3 --write
`);
}

/**
 * GitHub's anchor-slug algorithm (close enough for headings without HTML/emoji):
 * lowercase, strip anything that isn't a word char, space, or hyphen, then
 * convert spaces to hyphens.
 */
function slugify(text, seen) {
  // Mirror GitHub's slugger: lowercase, strip punctuation/symbols, then turn each
  // remaining space into a hyphen WITHOUT collapsing runs. "Install & Setup" -> the
  // "&" is removed leaving two spaces -> "install--setup", matching GitHub's anchor.
  let slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // drop punctuation/symbols (keeps word chars, spaces, hyphens)
    .replace(/ /g, '-'); // each space -> a hyphen (no collapsing)

  // Disambiguate duplicate slugs the way GitHub does: foo, foo-1, foo-2, ...
  const base = slug;
  let n = seen.get(base) || 0;
  if (n > 0) slug = `${base}-${n}`;
  seen.set(base, n + 1);
  return slug;
}

/**
 * Extract headings from markdown, skipping fenced code blocks (``` or ~~~).
 * Returns [{ level, text }].
 */
function extractHeadings(markdown, minLevel, maxLevel) {
  const lines = markdown.split('\n');
  const headings = [];
  let fence = null; // current code-fence marker, or null

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0]; // ` or ~
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue; // inside a code block

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (!h) continue;
    const level = h[1].length;
    if (level < minLevel || level > maxLevel) continue;
    const text = h[2].trim();
    if (text) headings.push({ level, text });
  }
  return headings;
}

/** Strip inline markdown (links, code, bold/italic) from heading display text. */
function cleanText(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [label](url) -> label
    .replace(/[`*_~]/g, '') // code/bold/italic markers
    .trim();
}

function buildToc(headings) {
  if (headings.length === 0) return '';
  const seen = new Map();
  const minLevel = Math.min(...headings.map((h) => h.level));
  const out = [];
  for (const { level, text } of headings) {
    const display = cleanText(text);
    const slug = slugify(display, seen);
    const indent = '  '.repeat(level - minLevel);
    out.push(`${indent}- [${display}](#${slug})`);
  }
  return out.join('\n');
}

/** Replace the block between markers, or insert one after the first H1 (or at top). */
function injectToc(markdown, toc) {
  const block = `${START_MARKER}\n${toc}\n${END_MARKER}`;
  const start = markdown.indexOf(START_MARKER);
  const end = markdown.indexOf(END_MARKER);

  if (start !== -1 && end !== -1 && end > start) {
    return markdown.slice(0, start) + block + markdown.slice(end + END_MARKER.length);
  }

  // No markers: insert after the first H1 if there is one, else at the very top.
  const lines = markdown.split('\n');
  const h1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (h1 !== -1) {
    lines.splice(h1 + 1, 0, '', block);
    return lines.join('\n');
  }
  return `${block}\n\n${markdown}`;
}

function parseArgs(argv) {
  const args = { file: null, write: false, minLevel: 2, maxLevel: 4, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--write') args.write = true;
    else if (a === '--min-level') args.minLevel = parseInt(argv[++i], 10);
    else if (a === '--max-level') args.maxLevel = parseInt(argv[++i], 10);
    else if (!a.startsWith('-') && args.file === null) args.file = a;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.file) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  if (Number.isNaN(args.minLevel) || Number.isNaN(args.maxLevel) || args.minLevel > args.maxLevel) {
    console.error('Error: invalid --min-level / --max-level range.');
    process.exit(1);
  }

  if (!fs.existsSync(args.file)) {
    console.error(`Error: file not found: ${args.file}`);
    process.exit(1);
  }

  const markdown = fs.readFileSync(args.file, 'utf8');
  const headings = extractHeadings(markdown, args.minLevel, args.maxLevel);

  if (headings.length === 0) {
    console.error(`No headings found between level ${args.minLevel} and ${args.maxLevel}.`);
    process.exit(1);
  }

  const toc = buildToc(headings);

  if (args.write) {
    const updated = injectToc(markdown, toc);
    fs.writeFileSync(args.file, updated);
    console.error(`✓ TOC written to ${args.file} (${headings.length} headings).`);
  } else {
    console.log(toc);
  }
}

if (require.main === module) main();

module.exports = { slugify, extractHeadings, buildToc, cleanText, injectToc };
