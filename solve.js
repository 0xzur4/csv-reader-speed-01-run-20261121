// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Returns exactly what csv-reader 1.0.0 returns for every input, but reads
// in bulk instead of one character at a time:
//   - a record with no quote before its first line break is sliced whole and
//     split on commas (the common case: plain words, numbers, codes);
//   - only records that hold a quote go through the field-by-field reader,
//     which jumps between special characters with indexOf instead of
//     stepping through every character.
// The broken-row policy is csv-reader's own, kept exactly: BOM dropped,
// stray CR dropped with an error, unterminated quote re-read as unquoted,
// junk after a closing quote appended with an error, short/long rows
// padded or cut with an error, empty lines no record.
//
// Measured on the practice set (6 cases, ~10.2 MB of CSV): ~95 ms per
// full run against ~510 ms for csv-reader 1.0.0 itself (~5.3x). Two
// alternatives were tried and measured slower, so they are not used here:
// a regex scan for unquoted fields (~140 ms) and caching the next LF
// across fields of a record (~145 ms) — V8's indexOf is cheaper than the
// bookkeeping either one adds.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const hasCR = text.indexOf('\r') !== -1;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recLine = 1;
  let recRow = null;

  // Reads an unquoted field onto `value`, from pos up to the next comma or
  // line break: a CR not followed by LF is dropped (stray_cr). Returns the
  // field, how it ended, and how many characters were kept (`added`).
  function readUnquoted(value) {
    let added = 0;
    while (pos < len) {
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      let end;
      let ended;
      if (comma !== -1 && (lf === -1 || comma < lf)) {
        end = comma;
        ended = COMMA;
      } else if (lf !== -1) {
        end = lf;
        ended = LINE_BREAK;
      } else {
        end = len;
        ended = END;
      }
      const seg = text.slice(pos, end);
      // An empty segment holds no CR: skip the scan (empty fields are common).
      const cr = hasCR && seg.length > 0 ? seg.indexOf('\r') : -1;
      if (cr === -1) {
        if (seg.length > 0) {
          value += seg;
          added += seg.length;
        }
        pos = end;
        if (ended === COMMA) pos += 1;
        else if (ended === LINE_BREAK) {
          pos += 1;
          line += 1;
        }
        return { value, ended, added };
      }
      if (ended === LINE_BREAK && cr === seg.length - 1) {
        // CRLF: the CR just before the LF ends the field with it.
        if (cr > 0) {
          value += seg.slice(0, cr);
          added += cr;
        }
        pos = end + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A stray CR inside the field: drop it, record it, read on.
      if (cr > 0) {
        value += seg.slice(0, cr);
        added += cr;
      }
      errors.push({ code: 'stray_cr', line: recLine, row: recRow });
      pos += cr + 1;
    }
    return { value, ended: END, added };
  }

  // A quoted segment (no quotes in it) with its line breaks folded to LF:
  // each CRLF or lone CR inside it is one LF, and the line count moves.
  function foldSegment(seg) {
    let out = '';
    let p = 0;
    while (p < seg.length) {
      const nl = seg.indexOf('\n', p);
      const cr = seg.indexOf('\r', p);
      let idx = -1;
      let isCR = false;
      if (nl !== -1 && (cr === -1 || nl < cr)) idx = nl;
      else if (cr !== -1) {
        idx = cr;
        isCR = true;
      }
      if (idx === -1) {
        out += seg.slice(p);
        break;
      }
      if (idx > p) out += seg.slice(p, idx);
      out += '\n';
      line += 1;
      p = isCR && seg[idx + 1] === '\n' ? idx + 2 : idx + 1;
    }
    return out;
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    while (true) {
      if (pos >= len) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
        return readUnquoted('"');
      }
      const q = text.indexOf('"', pos);
      if (q === -1) {
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
        return readUnquoted('"');
      }
      if (q > pos) {
        const seg = text.slice(pos, q);
        if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) value += seg;
        else value += foldSegment(seg);
      }
      if (text[q + 1] === '"') {
        value += '"';
        pos = q + 2;
        continue;
      }
      // Closed.
      pos = q + 1;
      if (pos >= len) return { value, ended: END };
      const c = text[pos];
      if (c === ',') {
        pos += 1;
        return { value, ended: COMMA };
      }
      if (c === '\n') {
        pos += 1;
        line += 1;
        return { value, ended: LINE_BREAK };
      }
      if (c === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
        return { value, ended: LINE_BREAK };
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      const junk = readUnquoted(value);
      if (junk.added > 0) errors.push({ code: 'quote_junk', line: recLine, row: recRow });
      return junk;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recLine = line;
    recRow = header && columns === null ? null : rows.length;

    let fields;
    let quoted = false;
    // Fast path: a record with no quote before its first line break holds
    // no quoted field, so it is sliced whole and split on commas.
    const lf = text.indexOf('\n', pos);
    const lfIdx = lf === -1 ? len : lf;
    let end = lfIdx;
    if (lf !== -1 && text[lfIdx - 1] === '\r') end = lfIdx - 1; // CRLF
    const seg = text.slice(pos, end);
    if (seg.indexOf('"') === -1) {
      if (lf !== -1) line += 1;
      pos = lf === -1 ? len : lf + 1;
      if (!hasCR || seg.indexOf('\r') === -1) {
        fields = seg.split(',');
      } else {
        // Stray CRs: each is an error, dropped.
        const parts = seg.split('\r');
        for (let i = 0; i < parts.length - 1; i++) {
          errors.push({ code: 'stray_cr', line: recLine, row: recRow });
        }
        fields = parts.join('').split(',');
      }
    } else {
      // The record holds a quote: read it field by field.
      fields = [];
      let field;
      do {
        quoted = text[pos] === '"';
        field = quoted ? readQuoted() : readUnquoted('');
        fields.push(field.value);
      } while (field.ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
