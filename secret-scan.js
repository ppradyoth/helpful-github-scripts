#!/usr/bin/env node
'use strict';

/**
 * secret-scan.js — zero-dependency scanner for hardcoded secrets in your files.
 *
 * The one mistake you can't take back: committing a live credential. Once it's in
 * git history it's public forever, even if the next commit deletes it — the fix is
 * to rotate the key, not to `git rm`. This catches it *before* the commit, using the
 * same prefix-anchored patterns the big scanners (gitleaks, trufflehog) rely on, with
 * no install and no network.
 *
 * What it catches (prefix-anchored, high confidence — reported as ERRORS):
 *   - AWS access key IDs           AKIA… / ASIA…            (AKIA[0-9A-Z]{16})
 *   - GitHub tokens                ghp_/gho_/ghu_/ghs_/ghr_ + fine-grained github_pat_
 *   - Slack tokens & webhooks      xoxb-/xoxp-… , hooks.slack.com/services/…
 *   - Google API keys              AIza…
 *   - Stripe secret/restricted keys sk_live_… / rk_live_…
 *   - npm tokens                   npm_…
 *   - Private key blocks           -----BEGIN … PRIVATE KEY-----
 *
 * Lower-confidence shapes (reported as WARNINGS — don't fail a build unless --strict):
 *   - JWT-shaped strings           eyJ….….…   (often not secret)
 *   - Generic `secret = "…"` assignments with a high-entropy value
 *
 * Every match is redacted in output (first/last few chars only) so the scanner's own
 * report never becomes the leak. Obvious placeholders (EXAMPLE, your_token_here,
 * <redacted>, ${VAR}, xxxxxxxx…) are filtered out to keep the noise down — this is why
 * AWS's own docs value AKIAIOSFODNN7EXAMPLE doesn't trip it.
 *
 * Usage:
 *   node secret-scan.js .                      # scan a directory tree (respects common ignores)
 *   node secret-scan.js src/config.js .env     # scan specific files
 *   node secret-scan.js . --strict             # warnings also fail (exit 1)
 *   node secret-scan.js . --json               # machine-readable report
 *   node secret-scan.js . --quiet              # only print findings, not the "clean" line
 *   node secret-scan.js --help
 *
 * Exit codes (CI / pre-commit friendly):
 *   0  no secrets (no ERROR findings; also no WARNINGs when --strict)
 *   1  at least one secret found
 *   2  usage error (bad flag, no paths, unreadable path)
 *
 * Honest limitations:
 *   - It scans the *working tree*, not git history. To check what's already committed,
 *     run it in a fresh clone or over `git log -p` output. A pre-commit hook is the point.
 *   - Prefix-anchored rules can't catch a bespoke in-house token with no fixed shape;
 *     the generic high-entropy rule is the fallback and is deliberately conservative.
 *   - Entropy filtering trades a few misses for far fewer false alarms. Tune THRESHOLDS
 *     below if your codebase is noisier or stricter than the defaults.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Detection rules. `severity: 'error'` shapes are specific enough to act on;
// 'warn' shapes are advisory. `entropy` (when set) is a minimum Shannon-entropy
// bits/char the matched value must clear, filtering doc placeholders.
// ---------------------------------------------------------------------------
const RULES = [
  {
    id: 'aws-access-key-id',
    description: 'AWS access key ID',
    severity: 'error',
    regex: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|ASCA)[0-9A-Z]{16}\b/g,
  },
  {
    id: 'github-token',
    description: 'GitHub personal access / OAuth token',
    severity: 'error',
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36}\b/g,
  },
  {
    id: 'github-fine-grained-pat',
    description: 'GitHub fine-grained personal access token',
    severity: 'error',
    regex: /\bgithub_pat_[0-9A-Za-z_]{22,}\b/g,
  },
  {
    id: 'slack-token',
    description: 'Slack token',
    severity: 'error',
    regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
  },
  {
    id: 'slack-webhook',
    description: 'Slack incoming webhook URL',
    severity: 'error',
    regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/]+/g,
  },
  {
    id: 'google-api-key',
    description: 'Google API key',
    severity: 'error',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    id: 'stripe-secret-key',
    description: 'Stripe secret / restricted key',
    severity: 'error',
    regex: /\b(?:sk|rk)_live_[0-9A-Za-z]{24,}\b/g,
  },
  {
    id: 'npm-token',
    description: 'npm access token',
    severity: 'error',
    regex: /\bnpm_[0-9A-Za-z]{36}\b/g,
  },
  {
    id: 'private-key-block',
    description: 'Private key block',
    severity: 'error',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
  },
  {
    id: 'jwt',
    description: 'JWT-shaped string (often not secret)',
    severity: 'warn',
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    id: 'generic-secret-assignment',
    description: 'High-entropy value assigned to a secret-looking name',
    severity: 'warn',
    // Capture the quoted value in group 1 so we can entropy-check just the value.
    regex: /(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)["']?\s*[:=]\s*["']([^"'\s]{12,})["']/gi,
    valueGroup: 1,
    entropy: 3.5,
  },
];

// Substrings/shapes that mark a value as an obvious placeholder, not a real secret.
const PLACEHOLDER_RE =
  /(example|placeholder|your[_-]?|changeme|change[_-]?me|dummy|sample|redacted|xxxx+|<[^>]+>|\$\{[^}]+\}|\{\{[^}]+\}\}|test[_-]?key|fake|foobar|1234567|abcdef|0000000|deadbeef)/i;

// Directories and file types never worth scanning.
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', '.next', 'out',
  'coverage', '.cache', '__pycache__', '.venv', 'venv', '.idea', '.vscode',
]);
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf', '.zip',
  '.gz', '.tar', '.tgz', '.bz2', '.7z', '.rar', '.mp4', '.mov', '.mp3', '.wav',
  '.woff', '.woff2', '.ttf', '.eot', '.otf', '.class', '.jar', '.wasm',
  '.lock', '.min.js', '.map',
]);
const MAX_BYTES = 2 * 1024 * 1024; // skip files larger than 2 MB

/** Shannon entropy in bits per character. Empty string → 0. */
function shannonEntropy(str) {
  if (!str) return 0;
  const freq = Object.create(null);
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  let bits = 0;
  const len = str.length;
  for (const ch in freq) {
    const p = freq[ch] / len;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** Redact a secret so the report itself doesn't leak it. */
function redact(secret) {
  const s = String(secret);
  if (s.length <= 8) return s[0] + '…' + s[s.length - 1];
  return s.slice(0, 4) + '…' + s.slice(-4) + ` (${s.length} chars)`;
}

/** Does this matched value look like a placeholder rather than a live secret? */
function isPlaceholder(value) {
  if (PLACEHOLDER_RE.test(value)) return true;
  // A value that's one repeated character (aaaa…, 0000…) isn't a real secret.
  if (/^(.)\1{7,}$/.test(value)) return true;
  return false;
}

/** Scan one file's text. Returns an array of finding objects. */
function scanText(text, file) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      rule.regex.lastIndex = 0;
      let m;
      while ((m = rule.regex.exec(line)) !== null) {
        const full = m[0];
        const value = rule.valueGroup ? m[rule.valueGroup] : full;
        if (isPlaceholder(value)) continue;
        if (rule.entropy && shannonEntropy(value) < rule.entropy) continue;
        findings.push({
          file,
          line: i + 1,
          col: m.index + 1,
          rule: rule.id,
          description: rule.description,
          severity: rule.severity,
          match: redact(value),
        });
        if (m.index === rule.regex.lastIndex) rule.regex.lastIndex++; // guard zero-width
      }
    }
  }
  return findings;
}

/** Scan a single file path (skips binary/oversized/unreadable). */
function scanFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (SKIP_EXT.has(ext)) return [];
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return [];
  }
  if (!stat.isFile() || stat.size > MAX_BYTES) return [];
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  // Cheap binary sniff: a NUL byte means "not text".
  if (text.indexOf('\0') !== -1) return [];
  return scanText(text, file);
}

/** Recursively collect scannable files under a directory. */
function walk(dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), acc);
    } else if (e.isFile()) {
      acc.push(path.join(dir, e.name));
    }
  }
  return acc;
}

/** Expand a list of paths (files or dirs) into files, then scan them all. */
function scanPaths(paths) {
  const files = [];
  for (const p of paths) {
    let stat;
    try {
      stat = fs.statSync(p);
    } catch {
      throw new Error(`cannot read path: ${p}`);
    }
    if (stat.isDirectory()) walk(p, files);
    else files.push(p);
  }
  const findings = [];
  for (const f of files) findings.push(...scanFile(f));
  return { findings, scanned: files.length };
}

function printHelp() {
  console.log(`secret-scan.js — zero-dep hardcoded-secret scanner

Usage:
  node secret-scan.js <path...> [options]

Options:
  --strict   Warnings (JWTs, generic high-entropy assignments) also fail the run.
  --json     Emit findings as JSON.
  --quiet    Suppress the "no secrets" success line.
  --help     Show this help.

Exit codes: 0 clean · 1 secret(s) found · 2 usage error

Examples:
  node secret-scan.js .
  node secret-scan.js src/ .env --strict
  node secret-scan.js . --json`);
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  const opts = {
    strict: args.includes('--strict'),
    json: args.includes('--json'),
    quiet: args.includes('--quiet'),
  };
  const known = new Set(['--strict', '--json', '--quiet', '--help']);
  const badFlag = args.find((a) => a.startsWith('--') && !known.has(a));
  if (badFlag) {
    console.error(`Unknown option: ${badFlag}\nRun with --help for usage.`);
    process.exit(2);
  }
  const paths = args.filter((a) => !a.startsWith('--'));
  if (paths.length === 0) {
    console.error('No paths given.\nRun with --help for usage.');
    process.exit(2);
  }

  let result;
  try {
    result = scanPaths(paths);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(2);
  }
  const { findings, scanned } = result;
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warn');

  if (opts.json) {
    console.log(JSON.stringify({ scanned, findings }, null, 2));
  } else if (findings.length === 0) {
    if (!opts.quiet) console.log(`✓ ${scanned} file(s) scanned, no secrets found`);
  } else {
    for (const f of findings) {
      const tag = f.severity === 'error' ? '✗' : '⚠';
      console.log(`${tag} ${f.file}:${f.line}:${f.col}  ${f.description} [${f.rule}]`);
      console.log(`      ↳ ${f.match}`);
    }
    const parts = [];
    if (errors.length) parts.push(`${errors.length} secret(s)`);
    if (warnings.length) parts.push(`${warnings.length} warning(s)`);
    console.log(`\n${parts.join(', ')} across ${scanned} file(s) scanned.`);
    if (errors.length && !warnings.length) {
      // nothing extra
    } else if (errors.length) {
      console.log('Rotate any real credential immediately — deleting the line is not enough once committed.');
    }
  }

  const failed = errors.length > 0 || (opts.strict && warnings.length > 0);
  process.exit(failed ? 1 : 0);
}

module.exports = { RULES, shannonEntropy, redact, isPlaceholder, scanText, scanFile, scanPaths };

if (require.main === module) {
  main(process.argv);
}
