#!/usr/bin/env node
/**
 * changelog-lint.js
 *
 * Lint a CHANGELOG.md against the "Keep a Changelog" convention
 * (https://keepachangelog.com/en/1.1.0/). The rest of the zero-dep lint family
 * in this repo checks generic Markdown (link-check.js, heading-lint.js,
 * list-lint.js, …) or commit history (commit-lint.js); this one checks the ONE
 * file whose structure downstream tooling actually parses — release automation,
 * GitHub Release notes, and humans skimming "what changed." A malformed version
 * heading (`## v1.2.0` instead of `## [1.2.0] - 2025-01-02`) or a typo'd change
 * group (`### Fixes` instead of `### Fixed`) silently drops a section out of every
 * parser that reads it. Same fence-skipping, same CLI shape, same CI-friendly exit
 * codes as its siblings.
 *
 * Checks (each rule can be toggled off):
 *
 *   1. version-format   (error)  An H2 that looks like a release heading but isn't
 *                                `## [x.y.z] - YYYY-MM-DD` (or `## [Unreleased]`).
 *                                Catches `## 1.2.0`, `## [1.2.0]` (no date),
 *                                `## v1.2.0 - 2025-01-02`, missing brackets, etc.
 *                                An optional ` [YANKED]` suffix is allowed.
 *   2. invalid-version  (error)  The bracketed version isn't valid SemVer
 *                                (e.g. `[1.2]`, `[1.2.0.0]`, `[01.2.0]`).
 *   3. invalid-date     (error)  The date isn't a real ISO `YYYY-MM-DD` calendar
 *                                date (e.g. `2025-13-40`, `2025-2-3`, `01/02/2025`).
 *   4. bad-change-type  (error)  An H3 under a version that isn't one of the six
 *                                Keep a Changelog groups: Added, Changed,
 *                                Deprecated, Removed, Fixed, Security. `### Fixes`,
 *                                `### New`, `### Notes` are the classic drift.
 *   5. duplicate-version(error)  The same version number appears in two headings.
 *   6. no-unreleased    (warn)   No `## [Unreleased]` section. Keep a Changelog
 *                                recommends one at the top so there's always a place
 *                                to add the next change.
 *   7. version-order    (warn)   Released versions aren't newest-first by SemVer
 *                                precedence, and/or `[Unreleased]` isn't the first
 *                                version section. Descending order is the convention.
 *   8. empty-section    (warn)   A version or change-group heading with no entries
 *                                beneath it before the next heading.
 *
 * Deliberately NOT checked (kept honest, not over-claimed):
 *   - Whether entry text is well-written, or whether every code change is logged.
 *   - Link-reference definitions at the bottom (`[1.2.0]: https://…/compare/…`);
 *     that's link-check.js's job, not this linter's.
 *   - The top-level `# Changelog` title / intro prose — style, not structure.
 *
 * Zero dependencies. Network-free. Works on any Node >= 14.
 *
 * Usage:
 *   node changelog-lint.js CHANGELOG.md              # lint one file
 *   node changelog-lint.js CHANGELOG.md --json        # machine-readable report
 *   node changelog-lint.js CHANGELOG.md --quiet       # only print problems
 *   node changelog-lint.js CHANGELOG.md --no-order --no-unreleased
 *   node changelog-lint.js --help
 *
 * Exit codes (CI / pre-commit friendly):
 *   0  no errors (warnings may be present)
 *   1  at least one error-level problem found
 *   2  usage / file-read error
 *
 * Also require()-able:
 *   const { lintText, parseSemver, isValidDate } = require('./changelog-lint.js');
 *   const problems = lintText(changelogString, { order: 'off' });
 */

'use strict';

const fs = require('fs');

// ---- rule severities -------------------------------------------------------

const DEFAULTS = {
  format: 'error',      // version-format
  version: 'error',     // invalid-version
  date: 'error',        // invalid-date
  changetype: 'error',  // bad-change-type
  duplicate: 'error',   // duplicate-version
  unreleased: 'warn',   // no-unreleased
  order: 'warn',        // version-order
  empty: 'warn',        // empty-section
};

// The six canonical change groups (Keep a Changelog 1.1.0), compared case-insensitively.
const CHANGE_TYPES = new Set(['added', 'changed', 'deprecated', 'removed', 'fixed', 'security']);

// Official SemVer 2.0.0 regex (semver.org), anchored.
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

// An H2 version heading: `## [X] - DATE` with an optional trailing ` [YANKED]`.
// Group 1 = bracket contents (version or "Unreleased"), group 2 = date text (may be undefined).
const VERSION_HEADING_RE = /^##\s+\[([^\]]+)\](?:\s*-\s*(.+?))?\s*(\[YANKED\])?\s*$/i;

// Any H2 at all (to catch release-ish headings that don't match the strict form).
const H2_RE = /^##\s+(?!#)(.*\S)\s*$/;
// Any H3 (change-group) heading.
const H3_RE = /^###\s+(?!#)(.*\S)\s*$/;

// ---- helpers (exported for reuse/testing) ----------------------------------

/** Parse a SemVer string into comparable parts, or null if invalid. */
function parseSemver(v) {
  const m = SEMVER_RE.exec(v);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    prerelease: m[4] || null, // presence lowers precedence vs. same x.y.z release
    raw: v,
  };
}

/** SemVer precedence compare (ignores build metadata, per spec). >0 if a>b. */
function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // A version WITH a pre-release has LOWER precedence than one without.
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  if (!a.prerelease && !b.prerelease) return 0;
  // Both have pre-release: dot-separated identifier comparison.
  const pa = a.prerelease.split('.');
  const pb = b.prerelease.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]);
    const nb = /^\d+$/.test(pb[i]);
    if (na && nb) {
      const d = parseInt(pa[i], 10) - parseInt(pb[i], 10);
      if (d !== 0) return d;
    } else if (na !== nb) {
      return na ? -1 : 1; // numeric identifiers are lower than alphanumeric
    } else if (pa[i] !== pb[i]) {
      return pa[i] < pb[i] ? -1 : 1;
    }
  }
  return 0;
}

/** True if `s` is a real ISO calendar date, exactly `YYYY-MM-DD`. */
function isValidDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  // Reject impossible days (e.g. Feb 30, Apr 31) via round-trip through Date.
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// ---- core linter -----------------------------------------------------------

/**
 * Lint a Keep-a-Changelog document.
 * @param {string} text
 * @param {object} [opts] per-rule severities: {format,version,date,changetype,
 *                        duplicate,unreleased,order,empty} each 'error'|'warn'|'off'
 * @returns {Array<{line:number, rule:string, severity:string, message:string}>}
 */
function lintText(text, opts) {
  const sev = Object.assign({}, DEFAULTS, opts || {});
  const lines = text.split(/\r?\n/);
  const problems = [];

  // Pass 1: flag fenced-code lines so a `## something` in a sample isn't a heading.
  const inFence = fenceMask(lines);

  // Pass 2: collect headings + track content presence for empty-section.
  // A "section" is a heading (H2 version or H3 change-group); it's non-empty if any
  // non-blank, non-heading line appears before the next heading of any level.
  const versions = []; // {line, name, semver|null, isUnreleased}
  const sections = []; // {line, kind:'version'|'change', label, hasContent}
  let current = null;      // the innermost open section awaiting content
  let currentVersion = null; // the open H2 version section (parent of change groups)

  const closeSection = () => {
    if (current) sections.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) { continue; }
    const raw = lines[i];
    const ln = i + 1;

    const h2 = raw.match(H2_RE);
    const h3 = raw.match(H3_RE);

    if (h2) {
      closeSection();
      lintVersionHeading(raw, ln, sev, problems, versions);
      current = { line: ln, kind: 'version', label: h2[1], hasContent: false };
      currentVersion = current;
      continue;
    }
    if (h3) {
      closeSection();
      // A change-group subsection counts as content for its parent version.
      if (currentVersion) currentVersion.hasContent = true;
      // bad-change-type
      const label = h3[1].trim();
      if (sev.changetype !== 'off' && !CHANGE_TYPES.has(label.toLowerCase())) {
        problems.push({
          line: ln,
          rule: 'bad-change-type',
          severity: sev.changetype,
          message: `change group "### ${label}" is not one of Added/Changed/Deprecated/Removed/Fixed/Security`,
        });
      }
      current = { line: ln, kind: 'change', label, hasContent: false };
      continue;
    }
    // A top-level H1 or any other heading closes the current section too.
    if (/^#\s/.test(raw) || /^#{4,}\s/.test(raw)) { closeSection(); currentVersion = null; continue; }

    // Content line?
    if (current && raw.trim() !== '') current.hasContent = true;
  }
  closeSection();

  // empty-section
  if (sev.empty !== 'off') {
    for (const s of sections) {
      if (!s.hasContent) {
        problems.push({
          line: s.line,
          rule: 'empty-section',
          severity: sev.empty,
          message: `${s.kind === 'version' ? 'version' : 'change-group'} heading "${s.label}" has no entries beneath it`,
        });
      }
    }
  }

  // duplicate-version
  if (sev.duplicate !== 'off') {
    const seen = new Map(); // normalized version string -> first line
    for (const v of versions) {
      if (v.isUnreleased) continue;
      const key = v.semver ? v.semver.raw : v.name;
      if (seen.has(key)) {
        problems.push({
          line: v.line,
          rule: 'duplicate-version',
          severity: sev.duplicate,
          message: `version [${key}] already declared at line ${seen.get(key)}`,
        });
      } else {
        seen.set(key, v.line);
      }
    }
  }

  // no-unreleased
  if (sev.unreleased !== 'off') {
    if (!versions.some((v) => v.isUnreleased)) {
      problems.push({
        line: 1,
        rule: 'no-unreleased',
        severity: sev.unreleased,
        message: 'no "## [Unreleased]" section found (Keep a Changelog recommends one at the top)',
      });
    }
  }

  // version-order: Unreleased must be first (if present); releases descending.
  if (sev.order !== 'off') {
    let sawReleased = false;
    for (const v of versions) {
      if (v.isUnreleased) {
        if (sawReleased) {
          problems.push({
            line: v.line,
            rule: 'version-order',
            severity: sev.order,
            message: '[Unreleased] should be the first version section, above released versions',
          });
        }
      } else {
        sawReleased = true;
      }
    }
    const released = versions.filter((v) => !v.isUnreleased && v.semver);
    for (let k = 1; k < released.length; k++) {
      if (compareSemver(released[k].semver, released[k - 1].semver) > 0) {
        problems.push({
          line: released[k].line,
          rule: 'version-order',
          severity: sev.order,
          message: `version [${released[k].semver.raw}] is newer than [${released[k - 1].semver.raw}] above it — list newest first`,
        });
      }
    }
  }

  problems.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return problems;
}

// Lint a single H2 heading; record it in `versions` when it parses as a release.
function lintVersionHeading(raw, ln, sev, problems, versions) {
  const vm = raw.match(VERSION_HEADING_RE);
  if (vm) {
    const inner = vm[1].trim();
    const dateText = vm[2] ? vm[2].trim() : null;

    if (/^unreleased$/i.test(inner)) {
      versions.push({ line: ln, name: 'Unreleased', semver: null, isUnreleased: true });
      return;
    }

    // Released heading: needs both a valid SemVer AND a valid date.
    const semver = parseSemver(inner);
    if (sev.version !== 'off' && !semver) {
      problems.push({
        line: ln,
        rule: 'invalid-version',
        severity: sev.version,
        message: `"[${inner}]" is not valid SemVer (expected MAJOR.MINOR.PATCH)`,
      });
    }
    if (dateText === null) {
      if (sev.format !== 'off') {
        problems.push({
          line: ln,
          rule: 'version-format',
          severity: sev.format,
          message: `release heading is missing a date — use "## [${inner}] - YYYY-MM-DD"`,
        });
      }
    } else if (sev.date !== 'off' && !isValidDate(dateText)) {
      problems.push({
        line: ln,
        rule: 'invalid-date',
        severity: sev.date,
        message: `date "${dateText}" is not a valid ISO date (YYYY-MM-DD)`,
      });
    }
    versions.push({ line: ln, name: inner, semver, isUnreleased: false });
    return;
  }

  // An H2 that isn't the strict form. Only flag it if it *looks like* a release
  // heading (mentions a version-ish token or a date) — a plain "## Notes" H2 in a
  // changelog isn't our business.
  const h2body = raw.replace(/^##\s+/, '').trim();
  const looksLikeRelease = /\bv?\d+\.\d+/.test(h2body) || /\d{4}-\d{2}-\d{2}/.test(h2body) || /^unreleased$/i.test(h2body);
  if (sev.format !== 'off' && looksLikeRelease) {
    problems.push({
      line: ln,
      rule: 'version-format',
      severity: sev.format,
      message: `version heading "## ${h2body}" doesn't match "## [x.y.z] - YYYY-MM-DD" (or "## [Unreleased]")`,
    });
  }
}

// Return a boolean[] marking which lines sit inside a fenced code block.
function fenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let fenceChar = null;
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceChar === null) {
      if (m) { fenceChar = m[1][0]; fenceLen = m[1].length; mask[i] = true; }
    } else {
      mask[i] = true;
      const cm = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (cm && cm[1][0] === fenceChar && cm[1].length >= fenceLen) { fenceChar = null; fenceLen = 0; }
    }
  }
  return mask;
}

// ---- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const files = [];
  const opts = { json: false, quiet: false, sev: Object.assign({}, DEFAULTS) };
  for (const a of argv) {
    switch (a) {
      case '--help':
      case '-h': opts.help = true; break;
      case '--json': opts.json = true; break;
      case '--quiet': opts.quiet = true; break;
      case '--no-format': opts.sev.format = 'off'; break;
      case '--no-version': opts.sev.version = 'off'; break;
      case '--no-date': opts.sev.date = 'off'; break;
      case '--no-changetype': opts.sev.changetype = 'off'; break;
      case '--no-duplicate': opts.sev.duplicate = 'off'; break;
      case '--no-unreleased': opts.sev.unreleased = 'off'; break;
      case '--no-order': opts.sev.order = 'off'; break;
      case '--no-empty': opts.sev.empty = 'off'; break;
      case '--strict': // promote all warnings to errors
        opts.sev.unreleased = 'error'; opts.sev.order = 'error'; opts.sev.empty = 'error'; break;
      default:
        if (a.startsWith('-')) { opts.badFlag = a; }
        else files.push(a);
    }
  }
  opts.files = files;
  return opts;
}

const HELP = `changelog-lint.js — lint a Keep-a-Changelog CHANGELOG.md (zero dependencies)

Usage:
  node changelog-lint.js <CHANGELOG.md> [more.md …] [options]

Checks:
  version-format    H2 not "## [x.y.z] - YYYY-MM-DD" / "## [Unreleased]"  (error)
  invalid-version   bracketed version isn't valid SemVer                  (error)
  invalid-date      date isn't a real ISO YYYY-MM-DD                       (error)
  bad-change-type   H3 not Added/Changed/Deprecated/Removed/Fixed/Security (error)
  duplicate-version same version declared twice                           (error)
  no-unreleased     no "## [Unreleased]" section                          (warn)
  version-order     releases not newest-first / Unreleased not on top     (warn)
  empty-section     a heading with no entries beneath it                  (warn)

Options:
  --json            machine-readable report
  --quiet           print only problems (no per-file "ok" lines)
  --strict          treat every warning as an error (affects exit code)
  --no-format --no-version --no-date --no-changetype
  --no-duplicate --no-unreleased --no-order --no-empty   turn a rule off
  -h, --help        this help

Exit codes: 0 = no errors, 1 = errors found, 2 = usage/read error`;

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); process.exit(0); }
  if (opts.badFlag) { console.error(`Unknown option: ${opts.badFlag}\n`); console.error(HELP); process.exit(2); }
  if (opts.files.length === 0) { console.error('No files given.\n'); console.error(HELP); process.exit(2); }

  const report = [];
  let errorCount = 0;
  let warnCount = 0;
  let readError = false;

  for (const file of opts.files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      console.error(`Cannot read ${file}: ${e.message}`);
      readError = true;
      continue;
    }
    const problems = lintText(text, opts.sev);
    for (const p of problems) {
      if (p.severity === 'error') errorCount++;
      else if (p.severity === 'warn') warnCount++;
    }
    report.push({ file, problems });
  }

  if (opts.json) {
    console.log(JSON.stringify({ report, errorCount, warnCount }, null, 2));
  } else {
    for (const { file, problems } of report) {
      if (problems.length === 0) {
        if (!opts.quiet) console.log(`✓ ${file}`);
        continue;
      }
      console.log(`✗ ${file}`);
      for (const p of problems) {
        const tag = p.severity === 'error' ? 'error' : 'warn ';
        console.log(`  ${tag} ${file}:${p.line}  [${p.rule}] ${p.message}`);
      }
    }
    if (!opts.quiet) {
      console.log(`\n${errorCount} error${errorCount === 1 ? '' : 's'}, ${warnCount} warning${warnCount === 1 ? '' : 's'}.`);
    }
  }

  if (readError) process.exit(2);
  process.exit(errorCount > 0 ? 1 : 0);
}

if (require.main === module) main();

module.exports = { lintText, parseSemver, compareSemver, isValidDate };
