/**
 * Minimal dependency-free PDF writer (A4, standard Helvetica fonts,
 * WinAnsi text). Enough for text documents such as the commercial invoice:
 * text with alignment, lines, rectangles and automatic width measuring.
 * y coordinates are measured from the TOP of the page.
 */

const W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "‰": 0x89, "‹": 0x8b, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99, "›": 0x9b,
};

function toWinAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code === 0x2192) out.push(0x2d, 0x3e); // →
    else if (WIN_ANSI_EXTRA[ch] !== undefined) out.push(WIN_ANSI_EXTRA[ch]);
    else if (code >= 32 && code < 127) out.push(code);
    else if (code >= 160 && code <= 255) out.push(code);
    else if (code === 9 || code === 10) out.push(32);
    else out.push(0x3f);
  }
  return out;
}

export function textWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (const byte of toWinAnsi(text)) units += byte >= 32 && byte <= 126 ? W[byte - 32] : 556;
  return (units / 1000) * size * (bold ? 1.06 : 1);
}

/** Greedy word wrap to `maxWidth` points. */
export function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (para.trim() === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, bold) <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

export interface TextOptions {
  size?: number;
  bold?: boolean;
  align?: "left" | "right" | "center";
  /** Gray level 0 (black) – 1 (white). */
  gray?: number;
}

export class PdfDocument {
  private pages: string[][] = [[]];

  get pageCount() {
    return this.pages.length;
  }

  addPage() {
    this.pages.push([]);
  }

  private get ops() {
    return this.pages[this.pages.length - 1];
  }

  text(x: number, yTop: number, text: string, opts: TextOptions = {}) {
    const size = opts.size ?? 10;
    const bold = opts.bold ?? false;
    const width = textWidth(text, size, bold);
    const px = opts.align === "right" ? x - width : opts.align === "center" ? x - width / 2 : x;
    const hex = toWinAnsi(text).map((b) => b.toString(16).padStart(2, "0")).join("");
    const gray = opts.gray ?? 0;
    this.ops.push(`${gray} g BT /${bold ? "F2" : "F1"} ${size} Tf ${px.toFixed(2)} ${(PAGE_HEIGHT - yTop).toFixed(2)} Td <${hex}> Tj ET`);
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.5, gray = 0) {
    this.ops.push(`${gray} G ${width} w ${x1.toFixed(2)} ${(PAGE_HEIGHT - y1).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_HEIGHT - y2).toFixed(2)} l S`);
  }

  rect(x: number, yTop: number, w: number, h: number, fillGray?: number, strokeGray?: number) {
    const y = PAGE_HEIGHT - yTop - h;
    const parts: string[] = [];
    if (fillGray !== undefined) parts.push(`${fillGray} g`);
    if (strokeGray !== undefined) parts.push(`${strokeGray} G 0.5 w`);
    parts.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    parts.push(fillGray !== undefined && strokeGray !== undefined ? "B" : fillGray !== undefined ? "f" : "S");
    this.ops.push(parts.join(" "));
  }

  /** Serialises to PDF bytes. */
  build(title = "Document"): Uint8Array {
    const objects: (string | Uint8Array)[] = [];
    const n = this.pages.length;
    // 1 catalog, 2 pages, 3 F1, 4 F2, then per page: page obj + content obj, then info
    const pageObj = (i: number) => 5 + i * 2;
    const contentObj = (i: number) => 6 + i * 2;
    const infoObj = 5 + n * 2;

    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Kids [${this.pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count ${n} >>`;
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    this.pages.forEach((ops, i) => {
      objects[pageObj(i)] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj(i)} 0 R >>`;
      const stream = ops.join("\n");
      objects[contentObj(i)] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });
    const titleHex = toWinAnsi(title).map((b) => b.toString(16).padStart(2, "0")).join("");
    objects[infoObj] = `<< /Title <${titleHex}> /Producer (TDP) >>`;

    const chunks: string[] = ["%PDF-1.4\n"];
    const offsets: number[] = [];
    let length = chunks[0].length;
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = length;
      const body = `${id} 0 obj\n${objects[id]}\nendobj\n`;
      chunks.push(body);
      length += body.length;
    }
    const xrefStart = length;
    let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    chunks.push(xref);
    // content is pure ASCII (text is hex-encoded), so string length === byte length
    return new TextEncoder().encode(chunks.join(""));
  }
}
