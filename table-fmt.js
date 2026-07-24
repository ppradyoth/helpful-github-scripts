#!/usr/bin/env node
/**
 * table-fmt.js
 *
 * Format (align) GitHub-Flavored Markdown tables — `gofmt` for the pipe tables
 * in your README. Pads every column to an even width and renders the delimiter
 * row to match each column's declared alignment, so the raw Markdown is
 * readable in an editor and diffs stay clean. The rendered HTML is unchanged;
 * this only touches the source whitespace.
 *
 * It's the formatting companion to the lint family in this repo
 * (markdown-toc.js / link-check.js / heading-lint.js): those tell you something
 * is wrong; this one quietly fixes the most tedious thing by hand — keeping a
 * table's columns aligned after you edit a cell.
 *
 * What it does to each table:
 *   - Trims and re-pads every cell so column borders line up.
 *   - Pads each column to the widest cell in that column (min width 3).
 *   - Rewrites the delimiter row to honor alignment: left (`:---`),
 *     right (`---:`), center (`:--:`), or none (`---`).
 *   - Justifies body cells to their column's alignment (left/right/center).
 *   - Pads short rows with empty cells and drops extra cells to the header's
 *     column count — exactly how GitHub renders a ragged table.
 *   - Leaves tables inside fenced code blocks (``` / ~~~) untouched.
 *   - Is idempotent: formatting twice produces identical output.
 *
 * Honest limitation: column width is measured in Unicode code points
 * (`Array.from(s).length`), not terminal display columns. Wide CJK characters
 * and emoji occupy two cells in a monospace editor, so a table full of them may
 * look slightly off even when this tool considers it aligned. ASCII tables —
 * the overwhelming common case — align exactly.
 *
 * Zero dependencies. Works on any Node >= 14.
 *
 * Usage:
 *   node table-fmt.js README.md                 # print formatted README to stdout
 *   node table-fmt.js README.md --write         # rewrite README.md in place
 *   node table-fmt.js *.md --write              # format many files in place
 *   node table-fmt.js README.md --check         # exit 1 if it isn't already formatted
 *   node table-fmt.js *.md --check --json       # machine-readable check report
 *   cat doc.md | node table-fmt.js -            # read stdin, write formatted to stdout
 *   node table-fmt.js --help
 *
 * Exit codes (CI / pre-commit friendly):
 *   0  success — formatted (stdout/--write), or --check found nothing to change
 *   1  --check found files that need formatting
 *   2  usage error (no files, missing file, bad flag)
 */

'use strict';

const fs = require('fs');

// --- core: split a table row into trimmed cells, respecting escaped pipes ---
function splitCells(line) {
  let s = line.trim();
  // Optional leading/trailing pipe. A trailing pipe is only a border if it
  // isn't escaped (`\|`).
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);

  const cells = [];
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      // keep escape sequences (e.g. \| ) intact inside the cell
      buf += c + s[i + 1];
      i++;
      continue;
    }
    if (c === '|') {
      cells.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  cells.push(buf.trim());
  return cells;
}

// A delimiter cell looks like ---, :---, ---:, or :--:
function isDelimiterCell(cell) {
  return /^:?-+:?$/.test(cell.trim());
}

// Is this line the delimiter (separator) row of a table?
function isDelimiterRow(line) {
  if (!line.includes('|') && !/^[\s:|-]+$/.test(line)) return false;
  const cells = splitCells(line);
  if (cells.length === 0) return false;
  return cells.every((c) => isDelimiterCell(c));
}

// A plausible table row contains at least one unescaped pipe.
function looksLikeRow(line) {
  const s = line.trim();
  if (s === '') return false;
  // strip escaped pipes, then require a real pipe somewhere
  return s.replace(/\\\|/g, '').includes('|');
}

function alignmentOf(delimCell) {
  const c = delimCell.trim();
  const left = c.startsWith(':');
  const right = c.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return 'none';
}

const cpLen = (s) => Array.from(s).length;

function padCell(cell, width, align) {
  const pad = width - cpLen(cell);
  if (pad <= 0) return cell;
  if (align === 'right') return ' '.repeat(pad) + cell;
  if (align === 'center') {
    const l = Math.floor(pad / 2);
    return ' '.repeat(l) + cell + ' '.repeat(pad - l);
  }
  return cell + ' '.repeat(pad); // left / none
}

function renderDelimiter(width, align) {
  const w = Math.max(width, 3);
  switch (align) {
    case 'left':
      return ':' + '-'.repeat(w - 1);
    case 'right':
      return '-'.repeat(w - 1) + ':';
    case 'center':
      return ':' + '-'.repeat(w - 2) + ':';
    default:
      return '-'.repeat(w);
  }
}

// Format one table given its raw lines (header, delimiter, ...body).
// `indent` is the leading whitespace to preserve on every emitted line.
function formatOneTable(rawLines, indent) {
  const header = splitCells(rawLines[0]);
  const delims = splitCells(rawLines[1]);
  const cols = header.length;
  const aligns = [];
  for (let i = 0; i < cols; i++) aligns.push(alignmentOf(delims[i] || '---'));

  // Normalize every body row to exactly `cols` cells (pad short, drop extra).
  const bodyRows = rawLines.slice(2).map((l) => {
    const cells = splitCells(l);
    while (cells.length < cols) cells.push('');
    cells.length = cols;
    return cells;
  });

  // Column widths from header + body (delimiter handled by min-3 in render).
  const widths = [];
  for (let i = 0; i < cols; i++) {
    let w = cpLen(header[i] || '');
    for (const row of bodyRows) w = Math.max(w, cpLen(row[i]));
    widths[i] = Math.max(w, 3);
  }

  const out = [];
  out.push(
    indent + '| ' + header.map((c, i) => padCell(c, widths[i], aligns[i])).join(' | ') + ' |'
  );
  out.push(indent + '| ' + widths.map((w, i) => renderDelimiter(w, aligns[i])).join(' | ') + ' |');
  for (const row of bodyRows) {
    out.push(indent + '| ' + row.map((c, i) => padCell(c, widths[i], aligns[i])).join(' | ') + ' |');
  }
  return out;
}

// Main pass: find tables outside fenced code blocks and reformat them.
function formatTables(content) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const out = [];
  let inFence = false;
  let fenceMarker = '';
  let tableCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track fenced code blocks (``` or ~~~). Tables inside are left alone.
    const fenceMatch = trimmed.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fenceMatch[1][0];
      } else if (trimmed.startsWith(fenceMarker.repeat(3)) || trimmed[0] === fenceMarker) {
        inFence = false;
        fenceMarker = '';
      }
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    // A table starts when this line is a row and the next is a delimiter row.
    if (
      looksLikeRow(line) &&
      i + 1 < lines.length &&
      isDelimiterRow(lines[i + 1]) &&
      splitCells(lines[i + 1]).length === splitCells(line).length
    ) {
      const indent = (line.match(/^\s*/) || [''])[0];
      const block = [line, lines[i + 1]];
      let j = i + 2;
      while (j < lines.length && looksLikeRow(lines[j]) && !isDelimiterRow(lines[j])) {
        block.push(lines[j]);
        j++;
      }
      out.push(...formatOneTable(block, indent));
      tableCount++;
      i = j - 1;
      continue;
    }

    out.push(line);
  }

  const output = out.join(newline);
  return { output, changed: output !== content, tableCount };
}

// ---------------------------- CLI ----------------------------
function printHelp() {
  console.log(`table-fmt.js — align GitHub-Flavored Markdown tables (zero deps)

Usage:
  node table-fmt.js <file.md> [more.md ...] [options]
  cat file.md | node table-fmt.js -

Options:
  --write     Rewrite files in place (default prints formatted output to stdout)
  --check     Don't write; exit 1 if any file isn't already formatted
  --json      Machine-readable report (with --check)
  --help      Show this help

Exit codes: 0 ok | 1 --check found unformatted files | 2 usage error`);
}

function fail(msg) {
  console.error('table-fmt: ' + msg);
  process.exit(2);
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return 0;
  }

  const write = args.includes('--write');
  const check = args.includes('--check');
  const json = args.includes('--json');
  const files = args.filter((a) => !a.startsWith('--'));

  for (const a of args) {
    if (a.startsWith('--') && !['--write', '--check', '--json'].includes(a)) {
      fail(`unknown flag: ${a}`);
    }
  }
  if (write && check) fail('--write and --check are mutually exclusive');
  if (files.length === 0) fail('no input files (pass a .md file or - for stdin)');

  // stdin mode
  if (files.length === 1 && files[0] === '-') {
    const content = fs.readFileSync(0, 'utf8');
    process.stdout.write(formatTables(content).output);
    return 0;
  }

  const report = [];
  let needsFormatting = false;

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (e) {
      fail(`cannot read ${file}: ${e.message}`);
    }
    const { output, changed, tableCount } = formatTables(content);
    report.push({ file, tables: tableCount, changed });

    if (check) {
      if (changed) needsFormatting = true;
    } else if (write) {
      if (changed) {
        fs.writeFileSync(file, output);
        if (!json) console.log(`formatted ${file} (${tableCount} table${tableCount === 1 ? '' : 's'})`);
      } else if (!json) {
        console.log(`unchanged ${file}`);
      }
    } else {
      // default: print formatted output to stdout
      process.stdout.write(output);
    }
  }

  if (json) {
    console.log(JSON.stringify({ files: report, needsFormatting }, null, 2));
  } else if (check) {
    for (const r of report) {
      console.log(`${r.changed ? 'WOULD FORMAT' : 'ok         '} ${r.file} (${r.tables} table${r.tables === 1 ? '' : 's'})`);
    }
    if (needsFormatting) {
      console.log('\nSome files are not formatted. Run with --write to fix.');
    }
  }

  return check && needsFormatting ? 1 : 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  splitCells,
  isDelimiterRow,
  alignmentOf,
  formatTables,
  formatOneTable,
};
