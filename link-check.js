#!/usr/bin/env node
/**
 * link-check.js
 *
 * Find broken links in Markdown files — the local kind that rot silently when you
 * rename a file or edit a heading. Catches the two failures README maintainers hit
 * most:
 *
 *   1. Relative file links that point at a path that no longer exists on disk
 *      ([guide](docs/guide.md) after you moved docs/guide.md).
 *   2. In-page anchor links to a heading that isn't there anymore
 *      ([jump](#install) after you renamed the "Install" section).
 *
 * It uses GitHub's real anchor-slug algorithm, so #section links are validated the
 * same way GitHub resolves them — the same logic markdown-toc.js uses to build a TOC.
 *
 * External links (http/https/mailto/tel) are reported as skipped by default — no
 * network calls, so the check is deterministic and CI-safe. Pass --external to print
 * them so you can eyeball the list.
 *
 * Zero dependencies. Works on any Node >= 14.
 *
 * Usage:
 *   node link-check.js README.md                  # check one file
 *   node link-check.js README.md docs/*.md         # check several
 *   node link-check.js README.md --json            # machine-readable report
 *   node link-check.js README.md --external        # also list (don't verify) external URLs
 *   node link-check.js --help
 *
 * Exit codes (CI / pre-commit friendly):
 *   0  all local links resolve
 *   1  one or more broken links found
 *   2  usage error (no files, missing file, bad flag)
 */

'use strict';

const fs = require('fs');
const path = require('path');

function printHelp() {
  console.log(`link-check.js — find broken local links in Markdown

Usage:
  node link-check.js <file.md> [more.md ...] [options]

Options:
  --json        Emit a JSON report instead of human-readable text.
  --external    List external URLs (http/https/mailto/tel) instead of silently
                skipping them. They are never fetched — listed only.
  --quiet       Only print broken links (and nothing on success).
  --help        Show this help.

Exit codes:
  0  all local links resolve
  1  broken link(s) found
  2  usage error

Examples:
  node link-check.js README.md
  node link-check.js README.md docs/guide.md
  node link-check.js README.md --check >/dev/null && echo ok   # in CI
`);
}

/**
 * GitHub's anchor-slug algorithm — identical to markdown-toc.js so that #anchor
 * links validate against the same slugs a generated TOC would produce.
 */
function slugify(text, seen) {
  let slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // drop punctuation/symbols (keep word chars, spaces, hyphens)
    .replace(/ /g, '-'); // each space -> a hyphen, no collapsing

  const base = slug;
  const n = seen.get(base) || 0;
  if (n > 0) slug = `${base}-${n}`;
  seen.set(base, n + 1);
  return slug;
}

/** Strip inline markdown from heading text before slugging (mirrors markdown-toc.js). */
function cleanText(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [label](url) -> label
    .replace(/[`*_~]/g, '')
    .trim();
}

/**
 * Walk the file once, tracking fenced code blocks so we ignore both headings and
 * links that live inside them. Returns { anchors: Set<string>, links: [...] }.
 *
 * Each link: { text, target, line, kind: 'image' | 'link' }.
 */
function parseMarkdown(markdown) {
  const lines = markdown.split('\n');
  const anchors = new Set();
  const seenSlugs = new Map();
  const links = [];
  let fence = null;

  // Inline link / image: ![alt](target) or [text](target). The leading "!" (optional)
  // marks an image. We capture the target up to the first ")" or whitespace, which
  // keeps `(url "title")` titles from leaking into the path.
  const linkRe = /(!?)\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)/g;

  lines.forEach((rawLine, i) => {
    const fenceMatch = rawLine.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      return;
    }
    if (fence !== null) return; // inside a code block — skip headings and links

    // Headings become anchors.
    const h = rawLine.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h && h[2].trim()) {
      anchors.add(slugify(cleanText(h[2].trim()), seenSlugs));
    }

    // Explicit anchors authors drop in HTML: <a name="x"> or id="x".
    const idMatches = rawLine.matchAll(/(?:name|id)\s*=\s*["']([^"']+)["']/g);
    for (const m of idMatches) anchors.add(m[1].toLowerCase());

    // Links on this line. Strip inline code spans first so `[x](y)` inside backticks
    // doesn't count as a real link.
    const line = rawLine.replace(/`[^`]*`/g, (s) => ' '.repeat(s.length));
    let m;
    while ((m = linkRe.exec(line)) !== null) {
      links.push({
        kind: m[1] === '!' ? 'image' : 'link',
        text: m[2],
        target: m[3].trim(),
        line: i + 1,
      });
    }
  });

  return { anchors, links };
}

const EXTERNAL_RE = /^(https?:|mailto:|tel:|ftp:|\/\/)/i;

/** Classify and resolve a single link against the parsed file. */
function classify(link, file, anchorsByFile) {
  const { target } = link;

  if (target.startsWith('#')) {
    return { type: 'anchor', anchor: target.slice(1).toLowerCase() };
  }
  if (EXTERNAL_RE.test(target)) {
    return { type: 'external' };
  }

  // Local path, optionally with a #fragment.
  const hashIdx = target.indexOf('#');
  const relPath = hashIdx === -1 ? target : target.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? null : target.slice(hashIdx + 1).toLowerCase();
  const decoded = decodeURIComponent(relPath);
  const resolved = path.resolve(path.dirname(file), decoded);

  return { type: 'file', resolved, fragment, relPath: decoded };
}

function checkFile(file, opts, anchorCache) {
  const broken = [];
  const external = [];
  let markdown;
  try {
    markdown = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { file, error: `cannot read file: ${err.message}`, broken, external, total: 0 };
  }

  const { anchors, links } = parseMarkdown(markdown);
  anchorCache.set(path.resolve(file), anchors);

  for (const link of links) {
    if (!link.target || link.target.startsWith('<')) continue; // empty or templated
    const info = classify(link, file);

    if (info.type === 'external') {
      external.push(link);
      continue;
    }

    if (info.type === 'anchor') {
      if (!anchors.has(info.anchor)) {
        broken.push({ ...link, reason: `no heading anchors to "#${info.anchor}" in this file` });
      }
      continue;
    }

    // info.type === 'file'
    if (!fs.existsSync(info.resolved)) {
      broken.push({ ...link, reason: `path not found: ${info.relPath}` });
      continue;
    }

    // If it points at a markdown file AND carries a #fragment, validate the anchor too.
    if (info.fragment && /\.(md|markdown)$/i.test(info.resolved)) {
      let targetAnchors = anchorCache.get(path.resolve(info.resolved));
      if (!targetAnchors) {
        try {
          targetAnchors = parseMarkdown(fs.readFileSync(info.resolved, 'utf8')).anchors;
          anchorCache.set(path.resolve(info.resolved), targetAnchors);
        } catch {
          targetAnchors = null;
        }
      }
      if (targetAnchors && !targetAnchors.has(info.fragment)) {
        broken.push({
          ...link,
          reason: `"${info.relPath}" exists but has no anchor "#${info.fragment}"`,
        });
      }
    }
  }

  return { file, broken, external, total: links.length };
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    printHelp();
    process.exit(args.length === 0 ? 2 : 0);
  }

  const opts = {
    json: args.includes('--json'),
    external: args.includes('--external'),
    quiet: args.includes('--quiet'),
  };
  const files = args.filter((a) => !a.startsWith('--'));

  const known = new Set(['--json', '--external', '--quiet', '--help']);
  const badFlag = args.find((a) => a.startsWith('--') && !known.has(a));
  if (badFlag) {
    console.error(`Unknown option: ${badFlag}\nRun with --help for usage.`);
    process.exit(2);
  }
  if (files.length === 0) {
    console.error('No Markdown files given.\nRun with --help for usage.');
    process.exit(2);
  }

  const anchorCache = new Map();
  const results = files.map((f) => checkFile(f, opts, anchorCache));

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    const anyBroken = results.some((r) => r.error || r.broken.length);
    process.exit(anyBroken ? 1 : 0);
  }

  let totalBroken = 0;
  let usageError = false;
  for (const r of results) {
    if (r.error) {
      console.error(`✗ ${r.file}: ${r.error}`);
      usageError = true;
      continue;
    }
    if (r.broken.length === 0) {
      if (!opts.quiet) {
        const ext = opts.external && r.external.length ? ` (${r.external.length} external, not checked)` : '';
        console.log(`✓ ${r.file} — ${r.total} link(s), all local links resolve${ext}`);
      }
    } else {
      totalBroken += r.broken.length;
      console.log(`✗ ${r.file} — ${r.broken.length} broken:`);
      for (const b of r.broken) {
        console.log(`    ${r.file}:${b.line}  [${b.text}](${b.target})`);
        console.log(`        ↳ ${b.reason}`);
      }
    }
    if (opts.external && r.external && r.external.length) {
      console.log(`  external (listed, not fetched):`);
      for (const e of r.external) console.log(`    ${r.file}:${e.line}  ${e.target}`);
    }
  }

  if (usageError && totalBroken === 0) process.exit(2);
  if (totalBroken > 0) {
    console.log(`\n${totalBroken} broken link(s) across ${files.length} file(s).`);
    process.exit(1);
  }
  process.exit(0);
}

// Export internals for reuse in your own tooling.
module.exports = { slugify, cleanText, parseMarkdown, classify, checkFile };

if (require.main === module) {
  main(process.argv);
}
