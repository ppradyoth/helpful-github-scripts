#!/usr/bin/env node
/**
 * reference-link-lint.js — validate Markdown reference-style links.
 *
 * Markdown has two link syntaxes. Inline — [text](url) — is what link-check.js
 * validates. Reference style is the other one:
 *
 *     See [the guide][guide] and the [changelog][].
 *
 *     [guide]: https://example.com/guide
 *     [changelog]: ./CHANGELOG.md
 *
 * The link text and the URL are separated: a [label] in the prose points at a
 * [label]: definition elsewhere in the file. It keeps long documents readable —
 * but it has two failure modes a URL checker never sees, because they're about
 * whether the label resolves, not whether the URL is reachable:
 *
 *   1. A reference with no definition — [text][gone] where [gone]: was renamed
 *      or never written. GitHub renders this as literal text, brackets and all.
 *      (markdownlint MD052.)
 *   2. A definition nothing uses — [old]: https://... left behind after the
 *      [old] references were deleted. Dead weight that rots silently. (MD053.)
 *
 * It also flags a label defined twice: CommonMark keeps the FIRST definition and
 * silently ignores the rest, so the second URL you thought you set never applies.
 *
 * Fence-aware and inline-code-aware: references inside ``` blocks or `backticks`
 * are ignored, so documented examples don't trip the linter.
 *
 * Zero dependencies. Node built-ins only.
 *
 * Usage:
 *   node reference-link-lint.js README.md                 # check one file
 *   node reference-link-lint.js README.md docs/*.md        # check several
 *   node reference-link-lint.js README.md --json           # machine-readable
 *   node reference-link-lint.js README.md --strict         # unused/dupe defs also fail
 *   node reference-link-lint.js README.md --quiet          # only print problems
 *
 * Exit codes: 0 clean · 1 problems found · 2 usage/read error.
 *
 * Severity:
 *   error   — undefined reference (the link is broken in the rendered page)
 *   warning — unused definition, duplicate definition (dead/ambiguous, not broken)
 * Warnings fail the run only under --strict.
 */

'use strict';

const fs = require('fs');

function printHelp() {
  const lines = [
    'reference-link-lint.js — validate Markdown reference-style links.',
    '',
    'Usage:',
    '  node reference-link-lint.js <file.md> [more.md ...] [options]',
    '',
    'Options:',
    '  --strict   Treat warnings (unused / duplicate definitions) as failures.',
    '  --json     Emit a machine-readable report.',
    '  --quiet    Print only files with problems.',
    '  --help     Show this message.',
    '',
    'Exit codes: 0 clean · 1 problems found · 2 usage/read error.',
  ];
  console.log(lines.join('\n'));
}

/**
 * CommonMark label normalization (enough of it for linting): trim, fold internal
 * whitespace runs to a single space, case-insensitive. So `[Foo  Bar]` and
 * `[foo bar]` resolve to the same definition, matching how a renderer matches them.
 */
function normLabel(label) {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Parse one Markdown document into { definitions, references, shortcutLabels }.
 *
 *   definitions   — Map<normLabel, [{ raw, line }...]>  (array so we can spot dupes)
 *   references    — [{ label, normLabel, line, raw }]   full [t][ref] + collapsed [ref][]
 *   shortcutLabels— Set<normLabel>  bare [ref] that would bind to a def if one exists
 *
 * Fenced code blocks and inline-code spans are skipped so examples don't count.
 */
function parseReferences(markdown) {
  const lines = markdown.split('\n');
  const definitions = new Map();
  const references = [];
  const shortcutLabels = new Set();
  let fence = null;

  // A link reference definition: up to 3 spaces indent, [label]: then a destination.
  // (Multi-line definitions with the title on the next line are rare; single-line
  // covers the practical case, same scope markdownlint lints in.)
  const defRe = /^ {0,3}\[([^\]]+)\]:\s*\S/;

  // Full [text][label] or collapsed [label][] reference (optional leading ! for images).
  const fullRe = /(!?)\[([^\]]+)\]\[([^\]]*)\]/g;

  // Inline link/image [text](url) — must be stripped before shortcut scanning so the
  // [text] half isn't mistaken for a shortcut reference.
  const inlineRe = /(!?)\[[^\]]*\]\([^)]*\)/g;

  lines.forEach((rawLine, i) => {
    const line = i + 1;

    // Track fences (``` or ~~~). A fence line toggles state and is never scanned.
    const fenceMatch = rawLine.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      return;
    }
    if (fence !== null) return;

    // Definition line? Record it and stop — its own [label]: is not a reference use.
    const defMatch = rawLine.match(defRe);
    if (defMatch) {
      const key = normLabel(defMatch[1]);
      if (!definitions.has(key)) definitions.set(key, []);
      definitions.get(key).push({ raw: defMatch[1], line });
      return;
    }

    // Blank out inline-code spans so `[x][y]` inside backticks doesn't count.
    let scan = rawLine.replace(/`[^`]*`/g, (s) => ' '.repeat(s.length));

    // Full + collapsed references. Collapsed [ref][] carries its label in the first
    // bracket pair; full [text][ref] in the second.
    let m;
    while ((m = fullRe.exec(scan)) !== null) {
      const explicitRef = m[3];
      const label = explicitRef !== '' ? explicitRef : m[2];
      references.push({
        label,
        normLabel: normLabel(label),
        line,
        raw: m[0],
      });
    }

    // For shortcut detection: remove inline links and the full/collapsed refs we just
    // consumed, then whatever [label] remains (not followed by (, [ or :) is a shortcut.
    scan = scan.replace(inlineRe, (s) => ' '.repeat(s.length));
    scan = scan.replace(fullRe, (s) => ' '.repeat(s.length));
    const shortcutRe = /(!?)\[([^\]]+)\](?![([:])/g;
    let s;
    while ((s = shortcutRe.exec(scan)) !== null) {
      shortcutLabels.add(normLabel(s[2]));
    }
  });

  return { definitions, references, shortcutLabels };
}

/** Lint one file, returning a structured result. */
function checkFile(file) {
  let markdown;
  try {
    markdown = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { file, error: `cannot read file: ${err.message}`, problems: [] };
  }

  const { definitions, references, shortcutLabels } = parseReferences(markdown);
  const problems = [];

  // MD052 — a full/collapsed reference whose definition doesn't exist. (Shortcuts
  // are excluded on purpose: an undefined [foo] is literal text, not a broken link.)
  for (const ref of references) {
    if (!definitions.has(ref.normLabel)) {
      problems.push({
        severity: 'error',
        rule: 'undefined-reference',
        line: ref.line,
        detail: `${ref.raw} — no definition for [${ref.label}]`,
      });
    }
  }

  // Which definitions are actually reached, by any of the three reference forms.
  const usedLabels = new Set();
  for (const ref of references) usedLabels.add(ref.normLabel);
  for (const label of shortcutLabels) {
    if (definitions.has(label)) usedLabels.add(label);
  }

  for (const [key, defs] of definitions) {
    // MD053 — a definition nothing references.
    if (!usedLabels.has(key)) {
      problems.push({
        severity: 'warning',
        rule: 'unused-definition',
        line: defs[0].line,
        detail: `[${defs[0].raw}]: is defined but never referenced`,
      });
    }
    // Duplicate definition — CommonMark keeps the first, ignores the rest.
    if (defs.length > 1) {
      const extra = defs.slice(1).map((d) => d.line).join(', ');
      problems.push({
        severity: 'warning',
        rule: 'duplicate-definition',
        line: defs[0].line,
        detail: `[${defs[0].raw}]: defined ${defs.length}× (lines ${defs
          .map((d) => d.line)
          .join(', ')}); only the first (line ${defs[0].line}) is used`,
      });
    }
  }

  problems.sort((a, b) => a.line - b.line);
  return { file, problems, defCount: definitions.size, refCount: references.length };
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    printHelp();
    process.exit(args.length === 0 ? 2 : 0);
  }

  const opts = {
    json: args.includes('--json'),
    quiet: args.includes('--quiet'),
    strict: args.includes('--strict'),
  };
  const known = new Set(['--json', '--quiet', '--strict', '--help']);
  const badFlag = args.find((a) => a.startsWith('--') && !known.has(a));
  if (badFlag) {
    console.error(`Unknown option: ${badFlag}\nRun with --help for usage.`);
    process.exit(2);
  }
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length === 0) {
    console.error('No Markdown files given.\nRun with --help for usage.');
    process.exit(2);
  }

  const results = files.map(checkFile);

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    const failed = results.some(
      (r) => r.error || r.problems.some((p) => p.severity === 'error' || (opts.strict && p.severity === 'warning'))
    );
    process.exit(failed ? 1 : 0);
  }

  let failing = 0;
  let usageError = false;
  for (const r of results) {
    if (r.error) {
      console.error(`✗ ${r.file}: ${r.error}`);
      usageError = true;
      continue;
    }
    const shown = r.problems.filter((p) => p.severity === 'error' || opts.strict || p.severity === 'warning');
    const counts = failsFor(r.problems, opts.strict);
    if (r.problems.length === 0) {
      if (!opts.quiet) {
        console.log(`✓ ${r.file} — ${r.refCount} reference(s), ${r.defCount} definition(s), all resolve`);
      }
      continue;
    }
    const errN = r.problems.filter((p) => p.severity === 'error').length;
    const warnN = r.problems.filter((p) => p.severity === 'warning').length;
    const mark = counts > 0 ? '✗' : '⚠';
    console.log(`${mark} ${r.file} — ${errN} error(s), ${warnN} warning(s):`);
    for (const p of shown) {
      const tag = p.severity === 'error' ? 'error' : 'warn ';
      console.log(`    ${r.file}:${p.line}  [${tag}] ${p.rule}`);
      console.log(`        ↳ ${p.detail}`);
    }
    failing += counts;
  }

  if (usageError && failing === 0) process.exit(2);
  if (failing > 0) {
    console.log(`\n${failing} failing problem(s) across ${files.length} file(s).`);
    process.exit(1);
  }
  process.exit(0);
}

/** How many problems in this file count as failures, given --strict. */
function failsFor(problems, strict) {
  return problems.filter((p) => p.severity === 'error' || (strict && p.severity === 'warning')).length;
}

module.exports = { normLabel, parseReferences, checkFile };

if (require.main === module) {
  main(process.argv);
}
