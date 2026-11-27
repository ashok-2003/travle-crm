// The QR helper draws a link as dark squares the page and the PDF share: the same modules the library encodes.
import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { qrSquares, qrSvg } from "../../src/qr/index.js";

const link = "upi://pay?pa=agency%40bank&pn=Sharma%20Holidays&am=3000.00&cu=INR&tn=Goa";

describe("the QR helper", () => {
  it("draws one square for every dark module of the link's code, inside the spec's 4-module quiet zone", () => {
    const { data, size } = encode(link, { ecc: "M", border: 4 });
    const squares = qrSquares(link);
    expect(squares.size).toBe(size);
    expect(squares.path.split("z").length - 1).toBe(data.flat().filter(Boolean).length);
    // No square starts within four modules of an edge.
    const starts = [...squares.path.matchAll(/M(\d+) (\d+)/g)].flatMap((match) => [Number(match[1]), Number(match[2])]);
    expect(Math.min(...starts)).toBe(4);
    expect(Math.max(...starts)).toBe(size - 5);
  });

  it("is an inline SVG with an accessible name and no script", () => {
    const svg = qrSvg(link, 'UPI QR to pay ₹3,000 to "Sharma" & Sons');
    expect(svg).toMatch(/^<svg [^>]*role="img"/);
    expect(svg).toContain('aria-label="UPI QR to pay ₹3,000 to &quot;Sharma&quot; &amp; Sons"');
    expect(svg).not.toMatch(/<script|onload|href=/i);
  });
});
