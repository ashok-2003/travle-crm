// What WhatsApp's markers turn into (spec item 13): the parser's blocks and spans, and the plain words for previews.
import { describe, expect, it } from "vitest";
import { parseWhatsApp, plainWhatsAppText } from "@/inbox/whatsapp-format";

const spansOf = (text: string) => {
  const [block] = parseWhatsApp(text);
  if (block === undefined || (block.kind !== "paragraph" && block.kind !== "quote")) throw new Error("not a paragraph");
  return block.spans;
};

describe("parseWhatsApp inline", () => {
  it("makes bold, italic, strike and code", () => {
    expect(spansOf("*Jibhi*")).toEqual([{ text: "Jibhi", bold: true }]);
    expect(spansOf("_a_ ~b~ `c`")).toEqual([
      { text: "a", italic: true },
      { text: " " },
      { text: "b", strike: true },
      { text: " " },
      { text: "c", code: true },
    ]);
  });

  it("nests one marker in another", () => {
    expect(spansOf("*a _b_*")).toEqual([
      { text: "a ", bold: true },
      { text: "b", bold: true, italic: true },
    ]);
  });

  it("leaves words that only contain marker characters as typed", () => {
    for (const text of ["2*3*4", "file_name_v2.pdf", "a@b_c.com", "*a\nb*", "* ", "a * b * c"]) {
      expect(
        spansOf(text)
          .map((span) => span.text)
          .join(""),
      ).toBe(text);
      expect(spansOf(text).every((span) => !span.bold && !span.italic)).toBe(true);
    }
  });

  it("makes an address one link and never formats inside it", () => {
    expect(spansOf("see https://x.co/a_b_c")).toEqual([
      { text: "see " },
      { text: "https://x.co/a_b_c", href: "https://x.co/a_b_c" },
    ]);
  });

  it("formats other scripts and emoji", () => {
    expect(spansOf("*नमस्ते*")).toEqual([{ text: "नमस्ते", bold: true }]);
    expect(spansOf("*Manali 🏔️*")).toEqual([{ text: "Manali 🏔️", bold: true }]);
  });

  it("closes before punctuation", () => {
    expect(spansOf("*Jibhi (2N/3D)*:")).toEqual([{ text: "Jibhi (2N/3D)", bold: true }, { text: ":" }]);
  });
});

describe("parseWhatsApp blocks", () => {
  it("keeps a code block untouched", () => {
    expect(parseWhatsApp("```x *y*```")).toEqual([{ kind: "code", text: "x *y*" }]);
    expect(parseWhatsApp("```\na\n_b_\n```")).toEqual([{ kind: "code", text: "a\n_b_" }]);
  });

  it("reads bullets, numbers and quotes", () => {
    expect(parseWhatsApp("- one\n- two")).toEqual([{ kind: "bullets", items: [[{ text: "one" }], [{ text: "two" }]] }]);
    expect(parseWhatsApp("* one")).toEqual([{ kind: "bullets", items: [[{ text: "one" }]] }]);
    expect(parseWhatsApp("1. a\n2. b")).toEqual([
      { kind: "numbered", items: [[{ text: "a" }], [{ text: "b" }]], numbers: [1, 2] },
    ]);
    expect(parseWhatsApp("> hi")).toEqual([{ kind: "quote", spans: [{ text: "hi" }] }]);
  });

  it("keeps the numbers as typed", () => {
    expect(parseWhatsApp("3. Hotel")).toEqual([{ kind: "numbered", items: [[{ text: "Hotel" }]], numbers: [3] }]);
    expect(plainWhatsAppText("2. 5 people\n3. December")).toBe("2. 5 people 3. December");
  });

  it("reads a number of four digits as plain text", () => {
    expect(parseWhatsApp("2026. Great year")).toEqual([{ kind: "paragraph", spans: [{ text: "2026. Great year" }] }]);
  });

  it("joins an indented line to the item above, keeping one list", () => {
    const [list, ...rest] = parseWhatsApp("1. *Manali*\n   Includes hotel\n2. *Spiti*");
    expect(rest).toEqual([]);
    expect(list).toMatchObject({ kind: "numbered", numbers: [1, 2] });
    expect(plainWhatsAppText("1. *Manali*\n   Includes hotel\n2. *Spiti*")).toBe("1. Manali Includes hotel 2. Spiti");
  });

  it("leaves a line after a paragraph that follows a list out of the list", () => {
    const blocks = parseWhatsApp("- a\nfoo\n  bar");
    expect(blocks.map((block) => block.kind)).toEqual(["bullets", "paragraph"]);
  });

  it("needs a space after > for a quote", () => {
    expect(parseWhatsApp(">50 people")).toEqual([{ kind: "paragraph", spans: [{ text: ">50 people" }] }]);
  });

  it("leaves a marker or punctuation right after an address out of the link", () => {
    expect(parseWhatsApp("*https://rzp.io/l/abc*")).toEqual([
      { kind: "paragraph", spans: [{ text: "https://rzp.io/l/abc", bold: true, href: "https://rzp.io/l/abc" }] },
    ]);
    expect(parseWhatsApp("pay https://rzp.io/l/abc.")).toEqual([
      {
        kind: "paragraph",
        spans: [{ text: "pay " }, { text: "https://rzp.io/l/abc", href: "https://rzp.io/l/abc" }, { text: "." }],
      },
    ]);
  });

  it("keeps the formatting of every line of a quote", () => {
    expect(parseWhatsApp("> *a*\n> b")).toEqual([
      {
        kind: "quote",
        spans: [{ text: "a", bold: true }, { text: "\nb" }],
      },
    ]);
  });

  it("treats *one* at a line start as bold, not a bullet", () => {
    expect(parseWhatsApp("*one*")).toEqual([{ kind: "paragraph", spans: [{ text: "one", bold: true }] }]);
  });

  it("keeps line breaks inside a paragraph and an unclosed fence as text", () => {
    expect(spansOf("a\nb")).toEqual([{ text: "a\nb" }]);
    expect(spansOf("```x")).toEqual([{ text: "```x" }]);
  });
});

describe("plainWhatsAppText", () => {
  it("is the words without markers on one line", () => {
    expect(plainWhatsAppText("*Jibhi* - _2N_\n- x")).toBe("Jibhi - 2N x");
  });
});
