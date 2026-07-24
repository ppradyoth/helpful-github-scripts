#!/usr/bin/env node
/**
 * link-text-lint.js
 *
 * Lint Markdown/HTML links for LOW-QUALITY LINK TEXT — the accessibility (and SEO)
 * problem that a link checker never catches. link-check.js tells you a URL is dead;
 * this tells you a *working* link has text that says nothing.
 *
 * Why it matters: screen-reader users routinely pull up a list of every link on the
 * page and navigate by that list alone, out of context. A page with ten links all
 * reading "click here" is ten identical, meaningless entries. Search engines treat
 * link text as a relevance signal for the destination, so "here" and "read more"
 * throw that signal away too. Descriptive link text ("the OWASP LLM Top 10") helps
 * both — it's the same fix (WCAG 2.4.4 Link Purpose).
 *
 * It's the a11y/SEO companion to image-alt-lint.js: that one flags images that
 * describe nothing to a listener; this flags *links* that do.
 *
 * Catches both Markdown and inline-HTML links:
 *
 *   Markdown   [text](url)   and reference style   [text][ref]
 *   HTML       <a href="...">text</a>
 *
 * (Image links `![alt](src)` are NOT links here — image-alt-lint.js owns those.
 *  Angle-bracket autolinks `<https://example.com>` are idiomatic and left alone.)
 *
 * Checks (each is an error or a warning; --strict promotes all to error):
 *
 *   1. empty-link-text     error   `[](url)` or `<a href=...></a>` — no text at all.
 *                                  A screen reader announces the raw URL or nothing.
 *   2. whitespace-text     error   Text is only spaces: `[   ](url)`. Renders empty.
 *   3. nondescriptive-text warning "click here", "here", "read more", "this link",
 *                                  "link", "more"… — meaningless out of context, the
 *                                  #1 WCAG 2.4.4 failure and a wasted SEO signal.
 *   4. url-as-text         warning The visible text is just the raw URL, e.g.
 *                                  `[https://ex.com/a/b/c](https://ex.com/a/b/c)`.
 *                                  A listener hears the whole URL read aloud; describe
 *                                  the destination instead. (Short bare domains are ok.)
 *
 * Skips fenced code blocks (``` / ~~~) and inline `code` spans, so a link written as
 * an *example* inside code never false-positives — the same fence-skipping every
 * other linter in this repo uses. Per-line opt-out: <!-- link-lint-ignore -->.
 *
 * Zero dependencies. Works on any Node >= 14.
 *
 * Usage:
 *   node link-text-lint.js README.md                 # lint one file
 *   node link-text-lint.js README.md docs/*.md        # lint several
 *   node link-text-lint.js README.md --json           # machine-readable report
 *   node link-text-lint.js README.md --strict         # warnings count as failures
 *   node link-text-lint.js README.md --no-html        # only Markdown links
 *   node link-text-lint.js --help
 *
 * Exit codes (CI / pre-commit friendly):
 *   0  no errors (warnings alone don't fail unless --strict)
 *   1  one or more errors found
 *   2  usage error (no files, missing file, bad flag)
 */

'use strict';

const fs = require('fs');

const SEVERITY = {
  'empty-link-text': 'error',
  'whitespace-text': 'error',
  'nondescriptive-text': 'warning',
  'url-as-text': 'warning',
};

// Non-descriptive link text, normalized (lowercased, trailing punctuation stripped).
const NONDESCRIPTIVE = new Set([
  'click here', 'click', 'click this', 'here', 'this', 'this link', 'this page',
  'link', 'link here', 'this one', 'read more', 'read this', 'more', 'more info',
  'more information', 'learn more', 'see more', 'see here', 'see this', 'go here',
  'details', 'view', 'view more', 'info', 'continue', 'continue reading', 'download',
  'check it out', 'check this out', 'website', 'page', 'url', 'this website',
]);

const URL_RE = /^(https?:\/\/|www\.)\S+$/i;

function printHelp() {
  console.log(`link-text-lint.js — lint Markdown/HTML links for low-quality link text

Usage:
  node link-text-lint.js <file.md> [more.md ...] [options]

Options:
  --strict      Treat warnings (nondescriptive-text, url-as-text) as errors too.
  --no-html     Only check Markdown [text](url) links; ignore <a> tags.
  --json        Emit a JSON report instead of human-readable text.
  --quiet       Only print problems (nothing on a clean file).
  --help        Show this help.

Per-line opt-out: put <!-- link-lint-ignore --> on the same line as a link to skip it.

Checks: empty-link-text (error), whitespace-text (error),
        nondescriptive-text (warning), url-as-text (warning).

Exit codes:
  0  no errors      1  error(s) found      2  usage error

Examples:
  node link-text-lint.js README.md
  node link-text-lint.js README.md docs/*.md --json
  node link-text-lint.js README.md --strict`);
}

/** Ranges [start, end) of inline `code` spans on a line. Used to skip a link that is
 *  written *inside* a code span (a literal example like `[here](x)`), while still
 *  keeping a real link whose *text* is code, e.g. [`examples/`](examples/) — there the
 *  link starts outside the span, so it's kept and plainText() unwraps the backticks. */
function codeSpanRanges(line) {
  const ranges = [];
  const re = /`+[^`]*`+/g;
  let m;
  while ((m = re.exec(line)) !== null) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

/** Is index `pos` inside any code span on the line? */
function inCodeSpan(pos, ranges) {
  return ranges.some(([s, e]) => pos >= s && pos < e);
}

/** Strip Markdown/HTML emphasis + formatting from link text so `**here**` == `here`. */
function plainText(text) {
  return String(text)
    .replace(/<[^>]+>/g, '')        // inner HTML tags (e.g. <strong>)
    .replace(/[*_`~]/g, '')         // md emphasis / code marks
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim();
}

/** Normalize for the nondescriptive lookup: lowercase, drop surrounding punctuation. */
function normalizeText(text) {
  return plainText(text).toLowerCase().replace(/^[\s>»→–—-]+|[\s.:!?,»→–—-]+$/g, '').trim();
}

/** Extract the value of an HTML attribute from a tag string, or null if absent. */
function htmlAttr(tag, name) {
  const dq = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'));
  if (dq) return dq[1];
  const sq = tag.match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'));
  if (sq) return sq[1];
  const bare = tag.match(new RegExp(name + '\\s*=\\s*([^\\s>]+)', 'i'));
  if (bare) return bare[1];
  return null;
}

/** Classify one link's text. Returns a rule name, or null if the text is fine. */
function classifyText(rawText, href) {
  const plain = plainText(rawText);
  if (rawText === '' || (rawText != null && plain === '' && rawText.trim() === '')) {
    // distinguish truly-empty from whitespace-only
    return rawText.trim() === '' && rawText.length > 0 ? 'whitespace-text' : 'empty-link-text';
  }
  if (plain === '') return 'empty-link-text';
  const norm = normalizeText(rawText);
  if (norm === '') return 'empty-link-text';
  if (NONDESCRIPTIVE.has(norm)) return 'nondescriptive-text';
  // url-as-text: the visible text is a URL. Only flag long ones — a short bare domain
  // ("example.com") reads fine aloud; a full deep link does not.
  if (URL_RE.test(plain) && plain.length > 24) return 'url-as-text';
  return null;
}

/**
 * Lint the links in one Markdown string. Returns problem objects:
 * { rule, severity, line, kind, href, text, message }.
 */
function lintLinks(markdown, opts) {
  const o = Object.assign({ html: true }, opts);
  const lines = markdown.split('\n');
  const problems = [];
  let fence = null;

  // Markdown inline [text](url ...) — but NOT image links ![text](url).
  const mdInline = /(!?)\[([^\]]*)\]\(\s*([^)\s]*)[^)]*\)/g;
  // Reference style [text][ref] — but not ![text][ref], and not the [ref]: def lines.
  const mdRef = /(!?)\[([^\]]*)\]\[([^\]]*)\]/g;
  const htmlAnchor = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;

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
    if (/<!--\s*link-lint-ignore\s*-->/.test(raw)) continue; // per-line opt-out

    const line = raw;
    const codeRanges = codeSpanRanges(line);
    const push = (rule, kind, href, text) => {
      if (!rule) return;
      problems.push({ rule, severity: SEVERITY[rule], line: i + 1, kind,
        href: href || '', text: text == null ? '' : text, message: messageFor(rule, kind, href, text) });
    };

    let m;
    mdInline.lastIndex = 0;
    while ((m = mdInline.exec(line)) !== null) {
      if (m[1] === '!') continue;            // image, not a link
      if (inCodeSpan(m.index, codeRanges)) continue; // literal example inside `code`
      push(classifyText(m[2], m[3]), 'markdown', m[3], m[2]);
    }
    mdRef.lastIndex = 0;
    while ((m = mdRef.exec(line)) !== null) {
      if (m[1] === '!') continue;            // image reference
      if (inCodeSpan(m.index, codeRanges)) continue;
      push(classifyText(m[2], m[3]), 'markdown-ref', m[3], m[2]);
    }

    if (o.html) {
      htmlAnchor.lastIndex = 0;
      while ((m = htmlAnchor.exec(line)) !== null) {
        if (inCodeSpan(m.index, codeRanges)) continue;
        const inner = m[1];
        const tag = m[0].match(/<a\b[^>]*>/i)[0];
        const href = htmlAttr(tag, 'href');
        // If the anchor wraps an image, its "text" is the image — alt is that image's job.
        if (/<img\b/i.test(inner) && plainText(inner) === '') continue;
        push(classifyText(inner, href), 'html', href, plainText(inner));
      }
    }
  }
  return problems;
}

function messageFor(rule, kind, href, text) {
  const where = href ? ` (→ ${href})` : '';
  const shown = plainText(text);
  switch (rule) {
    case 'empty-link-text':
      return `Link has no text${where} — a screen reader announces the raw URL or nothing; describe the destination`;
    case 'whitespace-text':
      return `Link text is only whitespace${where} — renders empty; describe the destination`;
    case 'nondescriptive-text':
      return `Link text "${shown}" says nothing out of context${where} — WCAG 2.4.4; use text that names the destination`;
    case 'url-as-text':
      return `Link text is a raw URL${where} — a listener hears the whole URL read aloud; use a human description`;
    default:
      return rule;
  }
}

function parseArgs(argv) {
  const opts = { strict: false, html: true, json: false, quiet: false, help: false };
  const files = [];
  for (const arg of argv) {
    switch (arg) {
      case '--strict': opts.strict = true; break;
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
    const problems = lintLinks(markdown, opts);
    totalProblems += problems.length;
    totalFailures += problems.filter((p) => isFailure(p, opts.strict)).length;
    report.push({ file, problems });
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: totalFailures === 0 && !usageError, usageError, strict: opts.strict, files: report }, null, 2));
  } else {
    for (const { file, problems } of report) {
      if (problems.length === 0) {
        if (!opts.quiet) console.log(`✓ ${file} — all links have descriptive text`);
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
    if (!opts.quiet && totalProblems === 0) console.log('\nAll links have descriptive text.');
  }

  if (usageError) process.exit(2);
  process.exit(totalFailures === 0 ? 0 : 1);
}

if (require.main === module) main();

module.exports = { lintLinks, classifyText, plainText, normalizeText, htmlAttr, codeSpanRanges };
