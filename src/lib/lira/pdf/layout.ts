import { PDFDocument, rgb, type PDFEmbeddedPage, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

export const PAGE_W = 612;
export const PAGE_H = 792;

export const COLORS = {
  text: rgb(0, 0, 0),
  heading: rgb(0.08, 0.3, 0.62),
  red: rgb(0.93, 0.05, 0.05),
  rowRed: rgb(1, 0, 0),
  rowYellow: rgb(1, 1, 0),
  border: rgb(0, 0, 0),
  rule: rgb(0.55, 0.55, 0.55),
  white: rgb(1, 1, 1),
};

export type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  display: PDFFont; // Montserrat Bold
  displaySemi: PDFFont; // Montserrat SemiBold
  serifBold: PDFFont; // Times Bold (result headline)
};

export type Run = { text: string; bold?: boolean; italic?: boolean; color?: RGB };

type Token = { text: string; font: PDFFont; color: RGB; width: number; spaceBefore: boolean };

export type ParaOpts = {
  size?: number;
  lineGap?: number;
  align?: "left" | "center" | "justify";
  indent?: number;
  spaceAfter?: number;
  bullet?: boolean;
  x?: number;
  width?: number;
};

export type Column = { header: string; width: number; align?: "left" | "center" };
export type RowStyle = { fill?: RGB; color?: RGB; bold?: boolean };

export class Layout {
  page!: PDFPage;
  y = 0;
  left = 72;
  right = 540;
  top = 690;
  bottom = 56;

  constructor(
    public doc: PDFDocument,
    public fonts: Fonts,
    private letterhead: PDFEmbeddedPage,
  ) {}

  get width() {
    return this.right - this.left;
  }

  get pageNumber() {
    return this.doc.getPageCount();
  }

  newPage(): PDFPage {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.page.drawPage(this.letterhead, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    this.y = this.top;
    return this.page;
  }

  ensure(h: number) {
    if (this.y - h < this.bottom) this.newPage();
  }

  space(h: number) {
    this.y -= h;
  }

  fontFor(r: Run) {
    if (r.bold) return this.fonts.bold;
    if (r.italic) return this.fonts.italic;
    return this.fonts.regular;
  }

  private tokenize(runs: Run[], size: number): Token[] {
    const tokens: Token[] = [];
    let pendingSpace = false;
    for (const r of runs) {
      const font = this.fontFor(r);
      const color = r.color ?? COLORS.text;
      const parts = r.text.split(/(\s+)/);
      for (const p of parts) {
        if (p === "") continue;
        if (/^\s+$/.test(p)) {
          pendingSpace = true;
          continue;
        }
        tokens.push({ text: p, font, color, width: font.widthOfTextAtSize(p, size), spaceBefore: pendingSpace });
        pendingSpace = false;
      }
    }
    return tokens;
  }

  private wrap(tokens: Token[], maxW: number, size: number): Token[][] {
    const spaceW = this.fonts.regular.widthOfTextAtSize(" ", size);
    const lines: Token[][] = [];
    let line: Token[] = [];
    let w = 0;
    for (const t of tokens) {
      const add = (line.length && t.spaceBefore ? spaceW : 0) + t.width;
      if (line.length && w + add > maxW) {
        lines.push(line);
        line = [{ ...t, spaceBefore: false }];
        w = t.width;
      } else {
        line.push(t);
        w += add;
      }
    }
    if (line.length) lines.push(line);
    return lines;
  }

  /** Measure paragraph height without drawing. */
  measure(runs: Run[], opts: ParaOpts = {}) {
    const size = opts.size ?? 11;
    const lh = size * (opts.lineGap ?? 1.38);
    const indent = (opts.indent ?? 0) + (opts.bullet ? 18 : 0);
    const maxW = (opts.width ?? this.width) - indent;
    return this.wrap(this.tokenize(runs, size), maxW, size).length * lh;
  }

  paragraph(runs: Run[] | string, opts: ParaOpts = {}) {
    if (typeof runs === "string") runs = [{ text: runs }];
    const size = opts.size ?? 11;
    const lh = size * (opts.lineGap ?? 1.38);
    const baseX = (opts.x ?? this.left) + (opts.indent ?? 0);
    const textX = baseX + (opts.bullet ? 18 : 0);
    const maxW = (opts.width ?? this.width) - (textX - (opts.x ?? this.left));
    const lines = this.wrap(this.tokenize(runs, size), maxW, size);
    const spaceW = this.fonts.regular.widthOfTextAtSize(" ", size);

    lines.forEach((line, li) => {
      this.ensure(lh);
      const baseline = this.y - size;
      if (opts.bullet && li === 0) {
        this.page.drawCircle({ x: baseX + 6, y: baseline + size * 0.32, size: 1.9, color: COLORS.text });
      }
      const natural = line.reduce((s, t, i) => s + t.width + (i > 0 && t.spaceBefore ? spaceW : 0), 0);
      const gaps = line.filter((t, i) => i > 0 && t.spaceBefore).length;
      let x = textX;
      let extra = 0;
      if (opts.align === "center") x = textX + (maxW - natural) / 2;
      else if (opts.align === "justify" && li < lines.length - 1 && gaps > 0) extra = (maxW - natural) / gaps;
      line.forEach((t, i) => {
        if (i > 0 && t.spaceBefore) x += spaceW + extra;
        this.page.drawText(t.text, { x, y: baseline, size, font: t.font, color: t.color });
        x += t.width;
      });
      this.y -= lh;
    });
    this.y -= opts.spaceAfter ?? 8;
  }

  heading(text: string, opts: { size?: number; color?: RGB; font?: PDFFont; align?: "left" | "center"; spaceBefore?: number; spaceAfter?: number } = {}) {
    const size = opts.size ?? 11;
    const font = opts.font ?? this.fonts.bold;
    this.y -= opts.spaceBefore ?? 6;
    this.ensure(size * 1.4 + 40);
    const w = font.widthOfTextAtSize(text, size);
    const x = opts.align === "center" ? this.left + (this.width - w) / 2 : this.left;
    this.page.drawText(text, { x, y: this.y - size, size, font, color: opts.color ?? COLORS.text });
    this.y -= size * 1.4 + (opts.spaceAfter ?? 6);
  }

  centeredText(text: string, y: number, size: number, font: PDFFont, color: RGB = COLORS.text) {
    const w = font.widthOfTextAtSize(text, size);
    this.page.drawText(text, { x: (PAGE_W - w) / 2, y, size, font, color });
  }

  /** Wrap a single-font string to lines within maxW. */
  wrapPlain(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const out: string[] = [];
    for (const para of String(text).split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (font.widthOfTextAtSize(test, size) <= maxW || !line) {
          // hard-break very long single words
          if (!line && font.widthOfTextAtSize(w, size) > maxW) {
            let chunk = "";
            for (const ch of w) {
              if (font.widthOfTextAtSize(chunk + ch, size) > maxW && chunk) {
                out.push(chunk);
                chunk = ch;
              } else chunk += ch;
            }
            line = chunk;
          } else line = test;
        } else {
          out.push(line);
          line = w;
        }
      }
      out.push(line);
    }
    return out.length ? out : [""];
  }

  table(opts: {
    columns: Column[];
    rows: string[][];
    x?: number;
    size?: number;
    pad?: number;
    rowStyle?: (i: number) => RowStyle | undefined;
    headerBold?: boolean;
    headerFill?: RGB;
    borders?: boolean;
    lineGap?: number;
    valign?: "top" | "middle";
  }) {
    const size = opts.size ?? 9;
    const pad = opts.pad ?? 3;
    const lh = size * (opts.lineGap ?? 1.2);
    const x0 = opts.x ?? this.left;
    const totalW = opts.columns.reduce((s, c) => s + c.width, 0);
    const borders = opts.borders ?? true;

    const drawRow = (cells: string[], style: RowStyle, isHeader: boolean) => {
      const font = isHeader ? (opts.headerBold === false ? this.fonts.regular : this.fonts.bold) : style.bold ? this.fonts.bold : this.fonts.regular;
      const wrapped = cells.map((c, i) => this.wrapPlain(c ?? "", font, size, opts.columns[i].width - pad * 2));
      const h = Math.max(...wrapped.map((l) => l.length)) * lh + pad * 2;
      return { font, wrapped, h };
    };

    const paint = (cells: string[], style: RowStyle, isHeader: boolean) => {
      const { font, wrapped, h } = drawRow(cells, style, isHeader);
      const top = this.y;
      const fill = isHeader ? opts.headerFill : style.fill;
      if (fill) this.page.drawRectangle({ x: x0, y: top - h, width: totalW, height: h, color: fill });
      let x = x0;
      opts.columns.forEach((col, i) => {
        const lines = wrapped[i];
        const blockH = lines.length * lh;
        const startY = opts.valign === "top" || isHeader ? top - pad : top - (h - blockH) / 2;
        lines.forEach((ln, li) => {
          const w = font.widthOfTextAtSize(ln, size);
          const tx = col.align === "center" ? x + (col.width - w) / 2 : x + pad;
          this.page.drawText(ln, { x: tx, y: startY - (li + 1) * lh + (lh - size) * 0.6, size, font, color: style.color ?? COLORS.text });
        });
        if (borders) {
          this.page.drawRectangle({ x, y: top - h, width: col.width, height: h, borderColor: COLORS.border, borderWidth: 0.6 });
        }
        x += col.width;
      });
      this.y -= h;
      return h;
    };

    const header = opts.columns.map((c) => c.header);
    const hasHeader = header.some((h) => h);
    const headerH = hasHeader ? drawRow(header, {}, true).h : 0;
    const paintHeader = () => hasHeader && paint(header, {}, true);

    this.ensure(headerH + 20);
    paintHeader();
    opts.rows.forEach((row, i) => {
      const style = opts.rowStyle?.(i) ?? {};
      const { h } = drawRow(row, style, false);
      if (this.y - h < this.bottom) {
        this.newPage();
        paintHeader();
      }
      paint(row, style, false);
    });
  }
}
