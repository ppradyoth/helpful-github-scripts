#!/usr/bin/env node
/**
 * commit-lint.js
 *
 * Lint git commit messages against the Conventional Commits convention
 * (https://www.conventionalcommits.org/) — the same shape tools like semantic-release
 * and changelog generators rely on. This is the commit-message companion to the
 * zero-dep lint family in this repo (link-check.js, heading-lint.js, list-lint.js, …):
 * same CLI shape, same CI-friendly exit codes, same "flag, don't rewrite" stance.
 *
 * A conventional commit header looks like:
 *
 *     type(optional-scope)!: short description
 *     ^^^^ ^^^^^^^^^^^^^^^ ^  ^^^^^^^^^^^^^^^^^
 *     |    |               |  └─ the summary (required, non-empty)
 *     |    |               └──── optional "!" = breaking change
 *     |    └──────────────────── optional scope in parens
 *     └───────────────────────── type: feat, fix, docs, … (required, lowercase)
 *
 * Checks (each rule can be toggled off):
 *
 *   1. header-format   The first line must parse as `type(scope)?!?: description`.
 *                      A message with no colon, an empty description, or a malformed
 *                      header is flagged. This is the check that makes a message
 *                      machine-readable at all. ERROR by default.
 *   2. type            The type must be one of the allowed set (feat, fix, docs,
 *                      style, refactor, perf, test, build, ci, chore, revert) and
 *                      lowercase. `Feat`, `feature`, or `fixed` are flagged — a typo'd
 *                      type silently drops the commit out of the changelog. Override
 *                      the set with --types. ERROR by default.
 *   3. blank-line      If the message has a body, exactly one blank line must separate
 *                      the header from it. `git log` and most parsers treat line 2 as
 *                      the required separator; a body glued to the header is misread as
 *                      one long subject. ERROR by default.
 *   4. subject-length  The header line should be at most --max-subject chars (default
 *                      72). Long subjects truncate in `git log --oneline`, GitHub, and
 *                      email. WARNING by default.
 *   5. subject-style   The description shouldn't end with a period and shouldn't start
 *                      with a capital letter (the commitlint default "imperative,
 *                      lower-case" house style). WARNING by default; silence with
 *                      --no-style.
 *   6. body-length     Body lines should wrap at --max-body chars (default 100).
 *                      A URL or a long code token on its own line is exempt. WARNING
 *                      by default.
 *
 * Breaking changes are recognized two ways (both accepted, never flagged): a `!`
 * before the colon in the header, or a `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer.
 *
 * Honest limitations (not over-claimed):
 *   - Not a full commitlint. It does not validate a scope enum, footer/issue-reference
 *     syntax, or the semver implication of a type — it checks the header grammar,
 *     type, structure, and length hygiene, which is where most bad commits go wrong.
 *   - The comment lines git adds to COMMIT_EDITMSG (lines starting with `#`) and an
 *     optional trailing `# ------ >8 ------` scissors section are stripped before
 *     linting, so it's safe to point straight at `.git/COMMIT_EDITMSG` from a
 *     commit-msg hook.
 *   - A `Merge ...` or `Revert "..."` auto-message from git is recognized and skipped
 *     by default (they aren't conventional and aren't yours to fix); --lint-merges
 *     forces them to be checked.
 *
 * Zero dependencies. Network-free. Works on any Node >= 14.
 *
 * Usage:
 *   node commit-lint.js .git/COMMIT_EDITMSG        # lint one message file (commit-msg hook)
 *   node commit-lint.js msg1.txt msg2.txt          # lint several message files
 *   node commit-lint.js --stdin                    # lint a message piped in
 *   node commit-lint.js --range origin/main..HEAD  # lint every commit in a git range
 *   node commit-lint.js --range HEAD~5..HEAD --json
 *   node commit-lint.js --types feat,fix,docs,chore --max-subject 50 msg.txt
 *   node commit-lint.js --help
 *
 * As a commit-msg hook (.git/hooks/commit-msg):
 *   #!/bin/sh
 *   exec node path/to/commit-lint.js "$1"
 *
 * Exit codes (CI / hook friendly):
 *   0  no errors (warnings may be present)
 *   1  at least one error-level problem found
 *   2  usage / file-read / git error
 *
 * Also require()-able:
 *   const { lintMessage } = require('./commit-lint.js');
 *   const problems = lintMessage('feat: add thing', { style: 'warn' });
 */

'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

// ---- rule severities -------------------------------------------------------

const DEFAULTS = {
  header: 'error',   // header-format
  type: 'error',     // unknown/miscased type
  blank: 'error',    // blank-line separator before body
  subject: 'warn',   // subject-length
  style: 'warn',     // subject-style (trailing period / leading capital)
  body: 'warn',      // body-length
};

const DEFAULT_TYPES = [
  'feat', 'fix', 'docs', 'style', 'refactor',
  'perf', 'test', 'build', 'ci', 'chore', 'revert',
];

const DEFAULT_MAX_SUBJECT = 72;
const DEFAULT_MAX_BODY = 100;

// Header grammar: type, optional (scope), optional !, ": ", description.
// Capture groups: 1=type, 2=scope (with parens), 3=bang, 4=description
const HEADER_RE = /^([a-zA-Z]+)(\([^)]*\))?(!)?: (.*)$/;
// A message that at least has a "word:" prefix, so we can tell "no colon at all"
// from "colon but malformed".
const HAS_COLON_RE = /^[^\s:]+.*: /;

// ---- helpers ---------------------------------------------------------------

/**
 * Strip the parts git adds that aren't part of the authored message:
 *   - comment lines beginning with `#`
 *   - everything after a `# ------------------------ >8 ------------------------`
 *     scissors line (verbose-commit diff section)
 * Returns the cleaned message with trailing blank lines trimmed.
 */
function stripGitCruft(raw) {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (const line of lines) {
    if (/^#\s*-+\s*>8\s*-+/.test(line)) break; // scissors: drop the rest
    if (/^#/.test(line)) continue;             // git comment line
    out.push(line);
  }
  // trim trailing blank lines
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out.join('\n');
}

function isMergeOrRevertAuto(header) {
  return /^Merge /.test(header) || /^Revert "/.test(header);
}

// URL or a single long unbroken token — not something you can wrap, so exempt.
function isUnwrappable(line) {
  const t = line.trim();
  if (/https?:\/\/\S+/.test(t)) return true;
  return !/\s/.test(t) && t.length > 0; // one long token, no spaces
}

// ---- core linter -----------------------------------------------------------

/**
 * Lint a single commit message. Returns an array of problem objects:
 *   { line, rule, severity: 'error'|'warn', message }
 *
 * opts:
 *   header/type/blank/subject/style/body : 'error' | 'warn' | 'off'  (per-rule)
 *   types      : string[]  allowed types (default DEFAULT_TYPES)
 *   maxSubject : number    (default 72)
 *   maxBody    : number    (default 100)
 *   lintMerges : boolean   also check Merge/Revert auto-messages (default false)
 */
function lintMessage(message, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const types = opts.types || DEFAULT_TYPES;
  const maxSubject = opts.maxSubject || DEFAULT_MAX_SUBJECT;
  const maxBody = opts.maxBody || DEFAULT_MAX_BODY;
  const problems = [];
  const push = (line, rule, sev, msg) => {
    if (sev === 'off') return;
    problems.push({ line, rule, severity: sev, message: msg });
  };

  const clean = stripGitCruft(message);
  if (clean.trim() === '') {
    push(1, 'header-format', cfg.header, 'empty commit message');
    return problems;
  }

  const lines = clean.split('\n');
  const header = lines[0];

  if (!opts.lintMerges && isMergeOrRevertAuto(header)) {
    return problems; // git-generated merge/revert message, not the author's to fix
  }

  // --- header grammar + type ---
  const m = HEADER_RE.exec(header);
  if (!m) {
    if (!HAS_COLON_RE.test(header)) {
      push(1, 'header-format', cfg.header,
        `header must be "type(scope)?: description" — no "type: " prefix found in "${header}"`);
    } else {
      push(1, 'header-format', cfg.header,
        `malformed header "${header}" — expected "type(scope)?!?: description" (needs a space after the colon and a non-empty description)`);
    }
  } else {
    const type = m[1];
    const description = m[4];
    if (type !== type.toLowerCase()) {
      push(1, 'type', cfg.type, `type "${type}" must be lowercase ("${type.toLowerCase()}")`);
    } else if (!types.includes(type)) {
      push(1, 'type', cfg.type,
        `unknown type "${type}" — allowed: ${types.join(', ')}`);
    }
    if (description.trim() === '') {
      push(1, 'header-format', cfg.header, 'description after the colon is empty');
    } else {
      // subject-style: trailing period + leading capital
      if (/\.$/.test(description)) {
        push(1, 'subject-style', cfg.style, 'description should not end with a period');
      }
      if (/^[A-Z][a-z]/.test(description)) {
        push(1, 'subject-style', cfg.style,
          `description should start lowercase ("${description[0].toLowerCase()}${description.slice(1)}")`);
      }
    }
  }

  // --- subject length (whole header line) ---
  if (header.length > maxSubject) {
    push(1, 'subject-length', cfg.subject,
      `header is ${header.length} chars (max ${maxSubject})`);
  }

  // --- blank line before body ---
  if (lines.length > 1) {
    if (lines[1].trim() !== '') {
      push(2, 'blank-line', cfg.blank,
        'body must be separated from the header by a blank line (line 2 is not blank)');
    }
    // --- body line length ---
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > maxBody && !isUnwrappable(line)) {
        push(i + 1, 'body-length', cfg.body,
          `body line is ${line.length} chars (max ${maxBody})`);
      }
    }
  }

  return problems;
}

// ---- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    files: [], json: false, quiet: false, help: false, badFlag: null,
    stdin: false, range: null, lintMerges: false,
    types: null, maxSubject: DEFAULT_MAX_SUBJECT, maxBody: DEFAULT_MAX_BODY,
    ruleOverrides: {},
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--json': opts.json = true; break;
      case '--quiet': opts.quiet = true; break;
      case '--stdin': opts.stdin = true; break;
      case '--lint-merges': opts.lintMerges = true; break;
      case '--help': case '-h': opts.help = true; break;
      case '--range': opts.range = argv[++i]; break;
      case '--types': opts.types = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean); break;
      case '--max-subject': opts.maxSubject = parseInt(argv[++i], 10) || DEFAULT_MAX_SUBJECT; break;
      case '--max-body': opts.maxBody = parseInt(argv[++i], 10) || DEFAULT_MAX_BODY; break;
      case '--no-subject': opts.ruleOverrides.subject = 'off'; break;
      case '--no-style': opts.ruleOverrides.style = 'off'; break;
      case '--no-body': opts.ruleOverrides.body = 'off'; break;
      default:
        if (a.startsWith('-')) { opts.badFlag = a; }
        else opts.files.push(a);
    }
  }
  return opts;
}

const HELP = `commit-lint.js — lint git commit messages against Conventional Commits (zero-dep)

Usage:
  node commit-lint.js <message-file...>     lint one or more commit-message files
  node commit-lint.js --stdin              lint a message piped on stdin
  node commit-lint.js --range A..B         lint every commit in a git range

Options:
  --range <A..B>    lint commits from \`git log A..B\` (subject + body each)
  --stdin           read a single message from stdin
  --types <list>    comma-separated allowed types (default: ${DEFAULT_TYPES.join(',')})
  --max-subject <n> max header length before warning (default ${DEFAULT_MAX_SUBJECT})
  --max-body <n>    max body line length before warning (default ${DEFAULT_MAX_BODY})
  --no-subject      turn off the subject-length check
  --no-style        turn off the trailing-period / leading-capital check
  --no-body         turn off the body line-length check
  --lint-merges     also check git-generated Merge/Revert messages (skipped by default)
  --json            machine-readable report
  --quiet           print only problems (no "ok" lines)
  --help            this text

Exit codes: 0 = no errors, 1 = error-level problem(s), 2 = usage/read/git error

As a commit-msg hook (.git/hooks/commit-msg):
  #!/bin/sh
  exec node path/to/commit-lint.js "$1"`;

// Read commit messages (subject + body) for a git range. Uses a record separator
// so multi-line bodies survive. Returns [{ label, message }].
function readRange(range) {
  const SEP = '\x1e'; // ASCII record separator, won't appear in a commit message
  const out = execFileSync(
    'git', ['log', '--format=%H%n%B' + SEP, range],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return out.split(SEP)
    .map(chunk => chunk.replace(/^\n/, '').replace(/\n$/, ''))
    .filter(c => c.trim() !== '')
    .map(chunk => {
      const nl = chunk.indexOf('\n');
      const hash = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
      const message = nl === -1 ? '' : chunk.slice(nl + 1);
      return { label: hash.slice(0, 8), message };
    });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); process.exit(0); }
  if (opts.badFlag) { console.error(`Unknown option: ${opts.badFlag}\n`); console.error(HELP); process.exit(2); }

  const lintOpts = {
    types: opts.types, maxSubject: opts.maxSubject, maxBody: opts.maxBody,
    lintMerges: opts.lintMerges, ...opts.ruleOverrides,
  };

  // Gather the messages to lint: --stdin | --range | files
  let items = []; // { label, message }
  let inputError = false;

  if (opts.stdin) {
    const msg = fs.readFileSync(0, 'utf8');
    items.push({ label: '<stdin>', message: msg });
  } else if (opts.range) {
    try {
      items = readRange(opts.range);
      if (items.length === 0) { console.error(`No commits in range ${opts.range}`); process.exit(2); }
    } catch (e) {
      console.error(`git error for range "${opts.range}": ${e.message.split('\n')[0]}`);
      process.exit(2);
    }
  } else if (opts.files.length > 0) {
    for (const f of opts.files) {
      try {
        items.push({ label: f, message: fs.readFileSync(f, 'utf8') });
      } catch (e) {
        console.error(`Cannot read ${f}: ${e.message}`);
        inputError = true;
      }
    }
  } else {
    console.error('No input: give a message file, --stdin, or --range A..B\n');
    console.error(HELP);
    process.exit(2);
  }

  // Lint each and report.
  const report = [];
  let errorCount = 0;
  let warnCount = 0;
  for (const { label, message } of items) {
    const problems = lintMessage(message, lintOpts);
    errorCount += problems.filter(p => p.severity === 'error').length;
    warnCount += problems.filter(p => p.severity === 'warn').length;
    report.push({ commit: label, problems });
  }

  if (opts.json) {
    console.log(JSON.stringify({ errorCount, warnCount, results: report }, null, 2));
    process.exit(inputError ? 2 : errorCount > 0 ? 1 : 0);
  }

  for (const { commit, problems } of report) {
    if (problems.length === 0) {
      if (!opts.quiet) console.log(`✅ ${commit}: ok`);
      continue;
    }
    console.log(`\n${commit}:`);
    for (const p of problems) {
      const icon = p.severity === 'error' ? '⛔' : '⚠️';
      console.log(`  ${icon} line ${p.line} [${p.rule}] ${p.message}`);
    }
  }

  if (!opts.quiet || errorCount > 0 || warnCount > 0) {
    console.log(`\n${errorCount} error(s), ${warnCount} warning(s) across ${items.length} commit(s).`);
  }
  if (inputError) process.exit(2);
  process.exit(errorCount > 0 ? 1 : 0);
}

if (require.main === module) main();

module.exports = { lintMessage, stripGitCruft };
