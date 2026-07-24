#!/usr/bin/env node
/**
 * image-alt-lint.js
 *
 * Lint Markdown images for missing or low-quality ALT TEXT — the accessibility
 * (and SEO) problem that no link checker or heading linter catches. A README
 * full of `![](diagram.png)` is invisible to screen readers and to Google Image
 * search; the picture is there, but for anyone who can't see it, it says nothing.
 *
 * It's the a11y companion to link-check.js: link-check tells you an image URL is
 * dead; this tells you a *live* image has no usable description.
 *
 * Catches both Markdown and inline-HTML images:
 *
 *   Markdown   ![alt](src)   and reference style   ![alt][ref]
 *   HTML       <img src="..." alt="...">            (very common in READMEs)
 *
 * Checks (each is either an error or a warning; --strict promotes all to error):
 *
 *   1. missing-alt      error   `![](src)` or `<img src=...>` with NO alt at all.
 *                               The hard accessibility failure — a screen reader
 *                               announces nothing (or reads the filename).
 *   2. whitespace-alt   error   Alt is present but only spaces: `![   ](src)`.
 *                               Renders as empty; same effect as missing.
 *   3. filename-alt     warning Alt is just the file name, e.g.
 *                               `![diagram.png](diagram.png)`. Describes the file,
 *                               not the content — no help to a listener.
 *   4. placeholder-alt  warning Alt is boilerplate: "image", "img", "photo",
 *                               "screenshot here", "alt text", "TODO", etc.
 *
 * A DECORATIVE image (a spacer, a divider rule) is *supposed* to have an
 * EXPLICIT empty alt (`alt=""`) so screen readers skip it — that's the WCAG
 * pattern, and it's a different thing from *forgetting* alt entirely. So:
 *   - `--allow-empty` treats an explicitly-empty alt (`![]()` or `alt=""`) as an
 *     intentional decorative image (ok). A `<img>` with NO alt attribute at all
 *     is still an error (that's the real accessibility bug — screen readers then
 *     read the filename). Mark HTML decorative images with `alt=""`,
 *     `role="presentation"`, or `aria-hidden="true"` (the last two skip always).
 *   - Or opt out per-line with a trailing `<!-- alt-lint-ignore -->`.
 *
 * Skips fenced code blocks (``` / ~~~) and inline `code` spans, so an image
 * written *as an example* inside code never false-positives — the same
 * fence-skipping the other linters in this repo use.
 *
 * Zero dependencies. Works on any Node >= 14.
 *
 * Usage:
 *   node image-alt-lint.js README.md                 # lint one file
 *   node image-alt-lint.js README.md docs/*.md        # lint several
 *   node image-alt-lint.js README.md --json           # machine-readable report
 *   node image-alt-lint.js README.md --strict         # warnings count as failures
 *   node image-alt-lint.js README.md --allow-empty    # empty alt = decorative, ok
 *   node image-alt-lint.js README.md --no-html        # only Markdown images
 *   node image-alt-lint.js --help
 *
 * Exit codes (CI / pre-commit friendly):
 *   0  no errors (warnings alone don't fail unless --strict)
 *   1  one or more errors found
 *   2  usage error (no files, missing file, bad flag)
 */

'use strict';

const fs = require('fs');

const SEVERITY = { 'missing-alt': 'error', 'whitespace-alt': 'error', 'filename-alt': 'warning', 'placeholder-alt': 'warning' };
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|avif|ico|tiff?)$/i;
const PLACEHOLDER_ALT = new Set([
  'image', 'img', 'images', 'picture', 'pic', 'photo', 'photos', 'graphic',
  'alt', 'alt text', 'alt-text', 'alttext', 'todo', 'fixme', 'placeholder',
  'untitled', 'image here', 'insert image', 'screenshot here', 'figure', 'fig',
]);

function printHelp() {
  console.log(`image-alt-lint.js — lint Markdown/HTML images for missing or weak alt text

Usage:
  node image-alt-lint.js <file.md> [more.md ...] [options]

Options:
  --strict         Treat warnings (filename-alt, placeholder-alt) as errors too.
  --allow-empty    Treat an EXPLICITLY empty/whitespace alt (![]() or alt="")
                   as an intentional DECORATIVE image (ok). A <img> with NO alt
                   attribute at all is still an error. Filename/placeholder alts
                   are still warned.
  --no-html        Only check Markdown ![](...) images; ignore <img> tags.
  --json           Emit a JSON report instead of human-readable text.
  --quiet          Only print problems (nothing on a clean file).
  --help           Show this help.

Per-line opt-out: put <!-- alt-lint-ignore --> on the same line as an image to
skip it (e.g. a deliberately decorative divider).

Checks: missing-alt (error), whitespace-alt (error), filename-alt (warning),
        placeholder-alt (warning).

Exit codes:
  0  no errors      1  error(s) found      2  usage error

Examples:
  node image-alt-lint.js README.md
  node image-alt-lint.js README.md docs/*.md --json
  node image-alt-lint.js README.md --strict`);
}

/** Blank out inline `code` spans on a line so an image inside them never matches.
 *  Replaces span contents with spaces to preserve line length / column offsets. */
function stripInlineCode(line) {
  return line.replace(/`+[^`]*`+/g, (m) => ' '.repeat(m.length));
}

/** Basename of a URL/path, minus query/fragment — for the filename-alt check. */
function basename(src) {
  if (!src) return '';
  const clean = src.split(/[?#]/)[0].trim();
  const parts = clean.split('/');
  return parts[parts.length - 1] || '';
}

/** Extract the value of an HTML attribute from a tag string, or null if absent. */
function htmlAttr(tag, name) {
  // name="..."  or  name='...'  or  name=bare
  const dq = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'));
  if (dq) return dq[1];
  const sq = tag.match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'));
  if (sq) return sq[1];
  const bare = tag.match(new RegExp(name + '\\s*=\\s*([^\\s>]+)', 'i'));
  if (bare) return bare[1];
  return null;
}

/** Classify one alt string against a src. Returns a rule name, or null if fine. */
function classifyAlt(alt, src, opts) {
  if (alt === null) return 'missing-alt'; // attribute/segment absent entirely
  if (alt.trim() === '') return opts.allowEmpty ? null : (alt === '' ? 'missing-alt' : 'whitespace-alt');
  const norm = alt.trim().toLowerCase();
  if (PLACEHOLDER_ALT.has(norm)) return 'placeholder-alt';
  // filename-alt: alt is an image filename, or equals the src's basename.
  if (IMAGE_EXT.test(norm) || (src && norm === basename(src).toLowerCase())) return 'filename-alt';
  return null;
}

/**
 * Lint the images in one Markdown string. Returns problem objects:
 * { rule, severity, line, kind, src, alt, message }.
 */
function lintImages(markdown, opts) {
  const o = Object.assign({ html: true, allowEmpty: false }, opts);
  const lines = markdown.split('\n');
  const problems = [];
  let fence = null;

  // Markdown inline ![alt](src ...), reference ![alt][ref], and HTML <img ...>
  const mdInline = /!\[([^\]]*)\]\(\s*([^)\s]*)[^)]*\)/g;
  const mdRef = /!\[([^\]]*)\]\[([^\]]*)\]/g;
  const htmlImg = /<img\b[^>]*>/gi;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // fence tracking (same rule as the other linters): a ``` / ~~~ run toggles.
    const fenceMatch = raw.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (/<!--\s*alt-lint-ignore\s*-->/.test(raw)) continue; // per-line opt-out

    const line = stripInlineCode(raw);
    const push = (rule, kind, src, alt) => {
      if (!rule) return;
      const severity = SEVERITY[rule];
      problems.push({ rule, severity, line: i + 1, kind, src: src || '', alt: alt === null ? null : alt,
        message: messageFor(rule, kind, src, alt) });
    };

    let m;
    mdInline.lastIndex = 0;
    while ((m = mdInline.exec(line)) !== null) push(classifyAlt(m[1], m[2], o), 'markdown', m[2], m[1]);
    mdRef.lastIndex = 0;
    while ((m = mdRef.exec(line)) !== null) push(classifyAlt(m[1], '', o), 'markdown-ref', '', m[1]);

    if (o.html) {
      htmlImg.lastIndex = 0;
      while ((m = htmlImg.exec(line)) !== null) {
        const tag = m[0];
        const src = htmlAttr(tag, 'src');
        // role="presentation" or aria-hidden="true" => intentionally decorative, skip.
        const role = (htmlAttr(tag, 'role') || '').toLowerCase();
        const ariaHidden = (htmlAttr(tag, 'aria-hidden') || '').toLowerCase();
        if (role === 'presentation' || role === 'none' || ariaHidden === 'true') continue;
        const alt = htmlAttr(tag, 'alt'); // null if the attribute is absent entirely
        push(classifyAlt(alt, src, o), 'html', src, alt);
      }
    }
  }
  return problems;
}

function messageFor(rule, kind, src, alt) {
  const where = src ? ` (src: ${src})` : '';
  switch (rule) {
    case 'missing-alt':
      return kind === 'html'
        ? `<img> has no alt attribute${where} — screen readers fall back to the filename or say nothing`
        : `Image has empty alt text \`![](...)\`${where} — invisible to screen readers and image search`;
    case 'whitespace-alt':
      return `Alt text is only whitespace${where} — renders as empty; describe the image or mark it decorative`;
    case 'filename-alt':
      return `Alt text "${(alt || '').trim()}" is just a file name${where} — describe what the image shows, not its filename`;
    case 'placeholder-alt':
      return `Alt text "${(alt || '').trim()}" is placeholder boilerplate${where} — replace with a real description`;
    default:
      return rule;
  }
}

function parseArgs(argv) {
  const opts = { strict: false, allowEmpty: false, html: true, json: false, quiet: false, help: false };
  const files = [];
  for (const arg of argv) {
    switch (arg) {
      case '--strict': opts.strict = true; break;
      case '--allow-empty': opts.allowEmpty = true; break;
      case '--no-html': opts.html = false; break;
      case '--json': opts.json = true; break;
      case '--quiet': opts.quiet = true; break;
      case '--help': case '-h': opts.help = true; break;
      default:
        if (arg.startsWith('-')) { opts.badFlag = arg; return { opts, files }; }
        files.push(arg);
    }
  }
  return { opts, files };
}

/** Does this problem count as a failure? errors always; warnings only under --strict. */
function isFailure(problem, strict) {
  return problem.severity === 'error' || (strict && problem.severity === 'warning');
}

function main() {
  const { opts, files } = parseArgs(process.argv.slice(2));

  if (opts.help) { printHelp(); process.exit(0); }
  if (opts.badFlag) { console.error(`Unknown flag: ${opts.badFlag}\n`); printHelp(); process.exit(2); }
  if (files.length === 0) { console.error('Error: no Markdown files given.\n'); printHelp(); process.exit(2); }

  const report = [];
  let totalFailures = 0;
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
    const problems = lintImages(markdown, opts);
    totalProblems += problems.length;
    totalFailures += problems.filter((p) => isFailure(p, opts.strict)).length;
    report.push({ file, problems });
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: totalFailures === 0 && !usageError, usageError, strict: opts.strict, files: report }, null, 2));
  } else {
    for (const { file, problems } of report) {
      if (problems.length === 0) {
        if (!opts.quiet) console.log(`✓ ${file} — all images have alt text`);
        continue;
      }
      const errs = problems.filter((p) => p.severity === 'error').length;
      const warns = problems.length - errs;
      console.log(`✗ ${file} — ${errs} error(s), ${warns} warning(s):`);
      for (const p of problems) {
        const tag = p.severity === 'error' ? 'ERR ' : 'warn';
        console.log(`    ${tag} [${p.rule}] line ${p.line}: ${p.message}`);
      }
    }
    if (!opts.quiet && totalProblems === 0) console.log('\nAll images have usable alt text.');
  }

  if (usageError) process.exit(2);
  process.exit(totalFailures === 0 ? 0 : 1);
}

if (require.main === module) main();

module.exports = { lintImages, classifyAlt, htmlAttr, basename, stripInlineCode };
