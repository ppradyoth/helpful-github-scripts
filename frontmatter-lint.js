#!/usr/bin/env node
/**
 * frontmatter-lint.js
 *
 * Lint the YAML frontmatter block at the top of Markdown files.
 *
 * Catches the boring mistakes that break static-site builds and content trackers:
 *   - missing required keys (e.g. title, date)
 *   - a date that isn't a real YYYY-MM-DD calendar date
 *   - a field that should be a list but is a bare string (e.g. tags: ai, llm)
 *   - a field that should be a boolean but is the string "true"
 *   - an empty title, an unterminated frontmatter block, duplicate keys
 *
 * Parses a practical subset of YAML — enough for real frontmatter: scalars,
 * quoted strings, flow lists ([a, b]), block lists (- item), booleans, numbers,
 * dates. Nested maps are reported as unsupported rather than silently mis-parsed.
 *
 * Zero dependencies. Network-free. Works on any Node >= 14.
 *
 * Usage:
 *   node frontmatter-lint.js post.md
 *   node frontmatter-lint.js posts/*.md --require title,date,tags
 *   node frontmatter-lint.js --dir blog --require title,date --list tags
 *   node frontmatter-lint.js post.md --json
 *
 * Exit codes:  0 = all clean   1 = lint problems found   2 = usage/IO error
 */

'use strict';

const fs = require('fs');
const path = require('path');

function printHelp() {
  console.log(`frontmatter-lint.js — lint YAML frontmatter in Markdown files

Usage:
  node frontmatter-lint.js <file.md> [more files...] [options]

Options:
  --require <keys>     Comma-separated keys that MUST be present and non-empty.
                       Default: title,date
  --date-keys <keys>   Comma-separated keys that must be a valid YYYY-MM-DD date.
                       Default: date
  --bool-keys <keys>   Comma-separated keys that must be a real boolean (not "true").
                       Default: draft
  --list <keys>        Comma-separated keys that must be a list (array).
                       Default: tags
  --dir <path>         Recursively lint every .md file under <path>.
  --allow-missing      Files with no frontmatter block pass instead of failing.
  --json               Emit machine-readable JSON instead of text.
  --quiet              Print only files with problems (and the summary).
  --help               Show this help.

Examples:
  node frontmatter-lint.js README.md
  node frontmatter-lint.js --dir blog-drafts --require title,date,tags,draft
  node frontmatter-lint.js post.md --list tags,categories --bool-keys draft,featured
`);
}

// ---- argument parsing -------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    files: [],
    require: ['title', 'date'],
    dateKeys: ['date'],
    boolKeys: ['draft'],
    listKeys: ['tags'],
    dir: null,
    allowMissing: false,
    json: false,
    quiet: false,
  };
  const csv = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help': case '-h': opts.help = true; break;
      case '--require': opts.require = csv(argv[++i] || ''); break;
      case '--date-keys': opts.dateKeys = csv(argv[++i] || ''); break;
      case '--bool-keys': opts.boolKeys = csv(argv[++i] || ''); break;
      case '--list': opts.listKeys = csv(argv[++i] || ''); break;
      case '--dir': opts.dir = argv[++i]; break;
      case '--allow-missing': opts.allowMissing = true; break;
      case '--json': opts.json = true; break;
      case '--quiet': opts.quiet = true; break;
      default:
        if (a.startsWith('-')) { opts.unknown = a; }
        else { opts.files.push(a); }
    }
  }
  return opts;
}

function walkMarkdown(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, acc);
    else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) acc.push(full);
  }
  return acc;
}

// ---- frontmatter extraction -------------------------------------------------

/**
 * Pull the frontmatter block delimited by `---` lines at the very top of the file.
 * Returns { found, lines, startLine, error }.
 */
function extractFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return { found: false };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---' || lines[i] === '...') {
      return { found: true, lines: lines.slice(1, i), startLine: 2 };
    }
  }
  return { found: true, error: 'frontmatter block opened with --- but never closed' };
}

// ---- minimal YAML subset parser ---------------------------------------------

function stripQuotes(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

function coerceScalar(raw) {
  const t = raw.trim();
  if (t === '') return { type: 'empty', value: '' };
  if (t === 'true' || t === 'false') return { type: 'bool', value: t === 'true' };
  if (t === 'null' || t === '~') return { type: 'null', value: null };
  if (/^-?\d+(\.\d+)?$/.test(t)) return { type: 'number', value: Number(t) };
  // flow list: [a, b, c]
  if (t.startsWith('[') && t.endsWith(']')) {
    const inner = t.slice(1, -1).trim();
    const items = inner === '' ? [] : inner.split(',').map((x) => stripQuotes(x));
    return { type: 'list', value: items };
  }
  return { type: 'string', value: stripQuotes(t) };
}

/**
 * Parse the frontmatter lines into { data, problems } where problems are
 * structural parse issues (duplicate keys, bad indentation, nested maps).
 */
function parseFrontmatter(fmLines, startLine) {
  const data = {};
  const problems = [];
  let currentListKey = null;

  for (let i = 0; i < fmLines.length; i++) {
    const ln = startLine + i;
    const line = fmLines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    // block-list item belonging to the previous key
    const listItem = line.match(/^(\s*)-\s+(.*)$/);
    if (listItem && currentListKey) {
      data[currentListKey].value.push(stripQuotes(listItem[2]));
      data[currentListKey].type = 'list';
      continue;
    }

    const kv = line.match(/^(\s*)([^:\s][^:]*):\s?(.*)$/);
    if (!kv) {
      problems.push({ line: ln, msg: `could not parse line: ${JSON.stringify(line)}` });
      continue;
    }
    const indent = kv[1].length;
    const key = kv[2].trim();
    const rest = kv[3];

    if (indent > 0) {
      problems.push({ line: ln, msg: `nested/indented key "${key}" — nested maps aren't supported in frontmatter linting` });
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      problems.push({ line: ln, msg: `duplicate key "${key}"` });
    }

    if (rest.trim() === '') {
      // could be the start of a block list, or an empty scalar
      data[key] = { type: 'empty', value: [], line: ln };
      data[key].value = [];
      currentListKey = key;
    } else {
      const sc = coerceScalar(rest);
      data[key] = { type: sc.type, value: sc.value, line: ln };
      currentListKey = null;
    }
  }
  return { data, problems };
}

// ---- validation -------------------------------------------------------------

function isValidIsoDate(s) {
  if (typeof s !== 'string') return false;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function lintFile(file, opts) {
  const issues = [];
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return { file, ok: false, issues: [{ msg: `cannot read file: ${e.message}` }] };
  }

  const fm = extractFrontmatter(text);
  if (!fm.found) {
    if (opts.allowMissing) return { file, ok: true, issues: [], skipped: true };
    return { file, ok: false, issues: [{ msg: 'no frontmatter block (expected --- at line 1)' }] };
  }
  if (fm.error) return { file, ok: false, issues: [{ line: 1, msg: fm.error }] };

  const { data, problems } = parseFrontmatter(fm.lines, fm.startLine);
  for (const p of problems) issues.push(p);

  // required keys present + non-empty
  for (const key of opts.require) {
    const node = data[key];
    if (!node) { issues.push({ msg: `missing required key "${key}"` }); continue; }
    const empty = node.type === 'empty' ||
      (node.type === 'string' && node.value === '') ||
      (node.type === 'list' && node.value.length === 0);
    if (empty) issues.push({ line: node.line, msg: `required key "${key}" is empty` });
  }

  // date keys
  for (const key of opts.dateKeys) {
    const node = data[key];
    if (!node) continue;
    if (!isValidIsoDate(String(node.value))) {
      issues.push({ line: node.line, msg: `"${key}" is not a valid YYYY-MM-DD date: ${JSON.stringify(node.value)}` });
    }
  }

  // boolean keys
  for (const key of opts.boolKeys) {
    const node = data[key];
    if (!node) continue;
    if (node.type !== 'bool') {
      issues.push({ line: node.line, msg: `"${key}" should be a boolean (true/false), got ${node.type}: ${JSON.stringify(node.value)}` });
    }
  }

  // list keys
  for (const key of opts.listKeys) {
    const node = data[key];
    if (!node) continue;
    if (node.type !== 'list') {
      issues.push({ line: node.line, msg: `"${key}" should be a list, got ${node.type}: ${JSON.stringify(node.value)}` });
    }
  }

  return { file, ok: issues.length === 0, issues, data };
}

// ---- main -------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { printHelp(); process.exit(0); }
  if (opts.unknown) { console.error(`Unknown option: ${opts.unknown}\n`); printHelp(); process.exit(2); }

  let files = opts.files.slice();
  if (opts.dir) {
    try { walkMarkdown(opts.dir, files); }
    catch (e) { console.error(`Cannot read --dir ${opts.dir}: ${e.message}`); process.exit(2); }
  }
  if (files.length === 0) { console.error('No files given. Pass file paths or --dir <path>.\n'); printHelp(); process.exit(2); }
  // de-dup while preserving order
  files = [...new Set(files)];

  const results = files.map((f) => lintFile(f, opts));
  const failed = results.filter((r) => !r.ok);

  if (opts.json) {
    console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
    process.exit(failed.length ? 1 : 0);
  }

  for (const r of results) {
    if (r.ok) {
      if (!opts.quiet) console.log(`✓ ${r.file}${r.skipped ? ' (no frontmatter, allowed)' : ''}`);
      continue;
    }
    console.log(`✗ ${r.file}`);
    for (const it of r.issues) {
      console.log(`    ${it.line ? `line ${it.line}: ` : ''}${it.msg}`);
    }
  }

  console.log(`\n${results.length - failed.length}/${results.length} file(s) clean.`);
  process.exit(failed.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { extractFrontmatter, parseFrontmatter, coerceScalar, isValidIsoDate, lintFile };
