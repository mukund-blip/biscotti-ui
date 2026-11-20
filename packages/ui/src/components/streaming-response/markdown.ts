/**
 * A deliberately small, offset-preserving markdown parser for streamed text.
 *
 * Every text leaf keeps its [from, to) range in the source, so the renderer can
 * split leaves at chunk boundaries and fade only the newly appended span.
 *
 * Robustness while streaming (`final = false`):
 *  - an unfinished last line that could still become a marker (`-`, `1.`, "``", `|`, `#`) is held back;
 *  - trailing partial inline markers (`*`, `**`, `_`, a backtick, `[1`) are held back;
 *  - unclosed emphasis / code / fences render optimistically as if closed,
 * so syntax never flashes as literal characters and then reflows.
 */

export type MdInline =
  | { t: "text"; from: number; to: number }
  | { t: "strong" | "em"; from: number; children: MdInline[] }
  | { t: "code"; from: number; to: number }
  | { t: "cite"; from: number; n: number };

export type MdBlock =
  | { t: "p"; key: number; inl: MdInline[] }
  | { t: "h"; key: number; level: number; inl: MdInline[] }
  | { t: "ul" | "ol"; key: number; start: number; items: { key: number; inl: MdInline[] }[] }
  | { t: "code"; key: number; lang: string; from: number; to: number; closed: boolean }
  | { t: "table"; key: number; align: ("left" | "right" | "center")[]; head: MdInline[][]; rows: { key: number; cells: MdInline[][] }[] };

export interface MdDoc {
  blocks: MdBlock[];
  /** How much of the source is currently shown (held-back tail excluded). */
  end: number;
}

const UL = /^(\s*)[-*+]\s+/;
const OL = /^(\s*)(\d{1,3})\.\s+/;
const FENCE = /^\s*```\s*([\w+-]*)\s*$/;
const FENCE_CLOSE = /^\s*```\s*$/;
const HEADING = /^(#{1,4})\s+/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-*:?\s*)*\|?\s*$/;
/** A last line that might still turn into block syntax. */
const MAYBE_MARKER = /^\s*([-*+]|\d{1,3}\.?|`{1,2}|#{1,4}|\|)?$/;

/** Where the visible text should end while streaming. */
export function visibleEnd(src: string, final: boolean): number {
  if (final) return src.length;
  let end = src.length;
  const nl = src.lastIndexOf("\n");
  const last = src.slice(nl + 1);
  if (last.length && MAYBE_MARKER.test(last)) end = nl + 1;
  // Inside an open code fence, don't apply inline hold-backs.
  if (fenceOpen(src.slice(0, end))) return end;
  const tail = src.slice(0, end).match(/(\*{1,2}|_{1,2}|`|\[\d{0,3})$/);
  if (tail) end -= tail[0].length;
  return end;
}

function fenceOpen(s: string) {
  let open = false;
  for (const line of s.split("\n")) if (/^\s*```/.test(line)) open = !open;
  return open;
}

/** Parse `src` (up to its visible end) into blocks. */
export function parseMarkdown(src: string, final = true): MdDoc {
  const end = visibleEnd(src, final);
  const text = src.slice(0, end);
  const blocks: MdBlock[] = [];
  // Split into lines with offsets.
  const lines: { s: number; e: number; v: string }[] = [];
  let at = 0;
  while (at <= text.length) {
    const nl = text.indexOf("\n", at);
    const e = nl === -1 ? text.length : nl;
    lines.push({ s: at, e, v: text.slice(at, e) });
    if (nl === -1) break;
    at = nl + 1;
  }
  if (lines.length && lines.at(-1)!.v === "" && lines.at(-1)!.s === text.length) lines.pop();

  const inl = (from: number, to: number) => parseInline(text, from, to, final);
  let i = 0;
  while (i < lines.length) {
    const L = lines[i];
    if (!L.v.trim()) { i++; continue; }

    const fence = L.v.match(FENCE);
    if (fence) {
      let j = i + 1;
      while (j < lines.length && !FENCE_CLOSE.test(lines[j].v)) j++;
      const closed = j < lines.length;
      const from = i + 1 < lines.length ? lines[i + 1].s : L.e;
      const to = closed ? Math.max(from, lines[j].s - 1) : text.length;
      blocks.push({ t: "code", key: L.s, lang: fence[1] ?? "", from, to: Math.max(from, to), closed });
      i = closed ? j + 1 : lines.length;
      continue;
    }

    const h = L.v.match(HEADING);
    if (h) {
      blocks.push({ t: "h", key: L.s, level: h[1].length, inl: inl(L.s + h[0].length, L.e) });
      i++;
      continue;
    }

    if (L.v.trimStart().startsWith("|")) {
      const rows: { s: number; cells: MdInline[][] }[] = [];
      let align: ("left" | "right" | "center")[] = [];
      let j = i;
      while (j < lines.length && lines[j].v.trimStart().startsWith("|")) {
        const row = lines[j];
        if (j === i + 1 && TABLE_SEP.test(row.v)) {
          align = splitCells(row.v, row.s).map(({ from, to }) => {
            const c = text.slice(from, to).trim();
            return c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left";
          });
        } else {
          rows.push({ s: row.s, cells: splitCells(row.v, row.s).map(({ from, to }) => inl(from, to)) });
        }
        j++;
      }
      const [head, ...body] = rows;
      blocks.push({ t: "table", key: L.s, align, head: head?.cells ?? [], rows: body.map((r) => ({ key: r.s, cells: r.cells })) });
      i = j;
      continue;
    }

    const ul = L.v.match(UL);
    const ol = L.v.match(OL);
    if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      const re = ul ? UL : OL;
      const items: { key: number; inl: MdInline[] }[] = [];
      let j = i;
      while (j < lines.length) {
        const row = lines[j];
        const m = row.v.match(re);
        if (m) {
          // gather lazy continuation lines
          let k = j + 1;
          while (k < lines.length && lines[k].v.trim() && !UL.test(lines[k].v) && !OL.test(lines[k].v) && !FENCE.test(lines[k].v) && !lines[k].v.trimStart().startsWith("|")) k++;
          items.push({ key: row.s, inl: inl(row.s + m[0].length, lines[k - 1].e) });
          j = k;
        } else if (!row.v.trim() && j + 1 < lines.length && re.test(lines[j + 1].v)) {
          j++; // loose list: blank line between items
        } else break;
      }
      blocks.push({ t: kind, key: L.s, start: ol ? Number(ol[2]) : 1, items });
      i = j;
      continue;
    }

    // paragraph
    let j = i + 1;
    while (j < lines.length && lines[j].v.trim() && !FENCE.test(lines[j].v) && !HEADING.test(lines[j].v) && !UL.test(lines[j].v) && !OL.test(lines[j].v) && !lines[j].v.trimStart().startsWith("|")) j++;
    blocks.push({ t: "p", key: L.s, inl: inl(L.s, lines[j - 1].e) });
    i = j;
  }
  return { blocks, end };
}

function splitCells(line: string, base: number) {
  const out: { from: number; to: number }[] = [];
  let start = line.indexOf("|") + 1;
  for (let k = start; k <= line.length; k++) {
    if (k === line.length || (line[k] === "|" && line[k - 1] !== "\\")) {
      let a = start, b = k;
      while (a < b && line[a] === " ") a++;
      while (b > a && line[b - 1] === " ") b--;
      // a trailing empty segment after the closing pipe isn't a cell
      if (!(k === line.length && a === b && line.trimEnd().endsWith("|"))) out.push({ from: base + a, to: base + b });
      start = k + 1;
    }
  }
  return out;
}

export function parseInline(src: string, from: number, to: number, final: boolean): MdInline[] {
  const out: MdInline[] = [];
  let textStart = from;
  const flush = (upto: number) => {
    if (upto > textStart) out.push({ t: "text", from: textStart, to: upto });
  };
  let i = from;
  while (i < to) {
    const c = src[i];
    if (c === "`") {
      const close = src.indexOf("`", i + 1);
      if (close !== -1 && close < to) {
        flush(i);
        out.push({ t: "code", from: i + 1, to: close });
        i = close + 1;
        textStart = i;
        continue;
      }
      if (!final) {
        flush(i);
        out.push({ t: "code", from: i + 1, to });
        return out;
      }
    } else if (c === "*" && src[i + 1] === "*" && src[i + 2] && src[i + 2] !== " ") {
      const close = src.indexOf("**", i + 2);
      if (close !== -1 && close < to) {
        flush(i);
        out.push({ t: "strong", from: i, children: parseInline(src, i + 2, close, final) });
        i = close + 2;
        textStart = i;
        continue;
      }
      if (!final) {
        flush(i);
        out.push({ t: "strong", from: i, children: parseInline(src, i + 2, to, final) });
        return out;
      }
    } else if ((c === "*" || (c === "_" && !/\w/.test(src[i - 1] ?? ""))) && src[i + 1] && src[i + 1] !== " " && src[i + 1] !== c) {
      let close = -1;
      for (let k = i + 1; k < to; k++) {
        if (src[k] === c && src[k - 1] !== " " && (c === "*" ? src[k + 1] !== "*" : !/\w/.test(src[k + 1] ?? ""))) { close = k; break; }
      }
      if (close !== -1) {
        flush(i);
        out.push({ t: "em", from: i, children: parseInline(src, i + 1, close, final) });
        i = close + 1;
        textStart = i;
        continue;
      }
      if (!final) {
        flush(i);
        out.push({ t: "em", from: i, children: parseInline(src, i + 1, to, final) });
        return out;
      }
    } else if (c === "[") {
      const m = src.slice(i, Math.min(to, i + 6)).match(/^\[(\d{1,3})\]/);
      if (m) {
        flush(i);
        out.push({ t: "cite", from: i, n: Number(m[1]) });
        i += m[0].length;
        textStart = i;
        continue;
      }
    }
    i++;
  }
  flush(to);
  return out;
}

/** Plain-text projection (for copy / accessible summaries). */
export function toPlainText(src: string) {
  return src
    .replace(/```[\w+-]*\n?/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^\w])[*_](.+?)[*_](?=[^\w]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(\d+)\]/g, "")
    .replace(/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/gm, "")
    .trim();
}
