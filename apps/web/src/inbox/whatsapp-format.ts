// WhatsApp's text markers (*bold*, _italic_, ~strike~, `code`, lists, quotes, code blocks) read into blocks and spans,
// with no React, so bubbles and previews share one set of rules. Web addresses are found first and never formatted inside.

export interface Span {
  text: string;
  bold?: true;
  italic?: true;
  strike?: true;
  code?: true;
  href?: string;
}
export type WhatsAppBlock =
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "quote"; spans: Span[] }
  | { kind: "bullets"; items: Span[][] }
  /** `numbers` are the numbers as typed, one per item: WhatsApp shows "3. Hotel" as 3, not as the list's next number. */
  | { kind: "numbered"; items: Span[][]; numbers: number[] }
  | { kind: "code"; text: string };

type Style = Pick<Span, "bold" | "italic" | "strike">;

const STYLES: Readonly<Record<string, keyof Style>> = { "*": "bold", _: "italic", "~": "strike" };
const SPACE = /\s/u;
// U+E000 and U+E001 hold a message-library blank while it is parsed (whatsapp-text.tsx): a blank is a word edge, as its braces are.
const EDGE = /[\s\p{P}\p{S}\uE000\uE001]/u;

/** Where each web address in the line starts and ends, so a marker never reaches into one. */
function addressRanges(line: string): [number, number][] {
  const ranges: [number, number][] = [];
  // A marker or punctuation right after an address belongs to the sentence, not the link.
  for (const found of line.matchAll(/https?:\/\/[^\s<>"']+/g))
    ranges.push([found.index, found.index + found[0].replace(/[*_~.,)!?]+$/, "").length]);
  return ranges;
}

function push(spans: Span[], text: string, style: Style, extra: Partial<Span> = {}) {
  if (text === "") return;
  const last = spans[spans.length - 1];
  const plain = Object.keys(extra).length === 0;
  if (plain && last !== undefined && last.href === undefined && last.code === undefined && sameStyle(last, style)) {
    last.text += text;
    return;
  }
  spans.push({ text, ...style, ...extra });
}

const sameStyle = (span: Span, style: Style) =>
  span.bold === style.bold && span.italic === style.italic && span.strike === style.strike;

/** The index of the marker that closes the one opened at `open`, or -1 when it has none on this line. */
function closerFor(line: string, open: number, ranges: [number, number][]): number {
  const marker = line[open];
  for (let at = open + 2; at < line.length; at += 1) {
    const char = line[at] ?? "";
    if (char === "\n") return -1;
    if (char !== marker || ranges.some(([from, to]) => at >= from && at < to)) continue;
    const before = line[at - 1] ?? "";
    const after = line[at + 1];
    if (!SPACE.test(before) && (after === undefined || EDGE.test(after))) return at;
  }
  return -1;
}

function parseInline(line: string, style: Style = {}, offset = 0, whole = line): Span[] {
  const spans: Span[] = [];
  const ranges = addressRanges(whole);
  let at = 0;
  while (at < line.length) {
    const position = offset + at;
    const range = ranges.find(([from, to]) => position >= from && position < to);
    if (range !== undefined) {
      const text = whole.slice(position, Math.min(range[1], offset + line.length));
      push(spans, text, style, { href: text });
      at += text.length;
      continue;
    }
    const char = line[at] ?? "";
    const before = position === 0 ? "" : (whole[position - 1] ?? "");
    const next = line[at + 1];
    const opens = (char in STYLES || char === "`") && (before === "" || EDGE.test(before));
    if (opens && next !== undefined && !SPACE.test(next) && next !== char) {
      const close = closerFor(line, at, ranges);
      if (close !== -1) {
        const inner = line.slice(at + 1, close);
        if (char === "`") push(spans, inner, style, { code: true });
        else {
          const key = STYLES[char] ?? "bold";
          for (const part of parseInline(inner, { ...style, [key]: true }, position + 1, whole)) spans.push(part);
        }
        at = close + 1;
        continue;
      }
    }
    push(spans, char, style);
    at += 1;
  }
  return spans;
}

const BULLET = /^[-*] +(\S.*)$/;
// A number of four digits or more ("2026. Great year") is a sentence, as WhatsApp shows it.
const NUMBERED = /^(\d{1,3})\. +(\S.*)$/;
const QUOTE = /^>(?: (.*))?$/;
const CONTINUATION = /^\s+\S/;

function parseLines(text: string): WhatsAppBlock[] {
  const blocks: WhatsAppBlock[] = [];
  // Raw lines of the paragraph or quote being read, parsed once when it ends so no marker is split between lines.
  let pending: { kind: "paragraph" | "quote"; lines: string[] } | null = null;
  const flush = () => {
    if (pending) blocks.push({ kind: pending.kind, spans: parseInline(pending.lines.join("\n")) });
    pending = null;
  };
  const collect = (kind: "paragraph" | "quote", line: string) => {
    if (pending?.kind !== kind) {
      flush();
      pending = { kind, lines: [] };
    }
    pending.lines.push(line);
  };
  const reading = () => pending !== null;
  // The list being read and each item's raw words, so an indented line under an item can join it.
  const open: { now: { block: Extract<WhatsAppBlock, { items: Span[][] }>; raws: string[] } | null } = { now: null };
  const grow = (kind: "bullets" | "numbered", item: string, number: number) => {
    flush();
    const last = blocks[blocks.length - 1];
    const spans = parseInline(item);
    if (last?.kind === kind && open.now?.block === last) {
      last.items.push(spans);
      open.now.raws.push(item);
      if (last.kind === "numbered") last.numbers.push(number);
    } else {
      const block: WhatsAppBlock =
        kind === "numbered" ? { kind, items: [spans], numbers: [number] } : { kind, items: [spans] };
      blocks.push(block);
      open.now = { block, raws: [item] };
    }
  };
  for (const line of text.split("\n")) {
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    const quote = QUOTE.exec(line);
    if (bullet) grow("bullets", bullet[1] ?? "", 0);
    else if (numbered) grow("numbered", numbered[2] ?? "", Number(numbered[1]));
    else if (
      open.now !== null &&
      !reading() &&
      CONTINUATION.test(line) &&
      blocks[blocks.length - 1] === open.now.block
    ) {
      const list = open.now;
      const at = list.raws.length - 1;
      list.raws[at] = `${list.raws[at] ?? ""}\n${line.trim()}`;
      list.block.items[at] = parseInline(list.raws[at] ?? "");
    } else if (quote) collect("quote", quote[1] ?? "");
    else if (line.trim() === "") flush();
    else collect("paragraph", line);
  }
  flush();
  return blocks;
}

const plainOf = (spans: Span[]) => spans.map((span) => span.text).join("");

/** The text as blocks of spans; ``` fences become code blocks first, their words untouched. */
export function parseWhatsApp(text: string): WhatsAppBlock[] {
  const blocks: WhatsAppBlock[] = [];
  let from = 0;
  for (const fence of text.matchAll(/```([\s\S]*?)```/g)) {
    blocks.push(...parseLines(text.slice(from, fence.index)));
    blocks.push({ kind: "code", text: (fence[1] ?? "").replace(/^\n|\n$/g, "") });
    from = fence.index + fence[0].length;
  }
  blocks.push(...parseLines(text.slice(from)));
  return blocks;
}

/** The words without their markers, on one line, for a chat list's preview. */
export function plainWhatsAppText(text: string): string {
  const words = parseWhatsApp(text).flatMap((block) => {
    switch (block.kind) {
      case "code":
        return [block.text];
      case "bullets":
        return block.items.map(plainOf);
      case "numbered":
        return block.items.map((item, at) => `${String(block.numbers[at])}. ${plainOf(item)}`);
      case "paragraph":
      case "quote":
        return [plainOf(block.spans)];
    }
  });
  return words.join(" ").replace(/\s+/g, " ").trim();
}
