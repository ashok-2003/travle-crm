// The QR helper draws a link as dark squares the page and the PDF share: the same modules the library encodes.
import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { qrSquares, qrSvg } from "../../src/qr/index.js";

const link = "upi://pay?pa=agency%40bank&pn=Sharma%20Holidays&am=3000.00&cu=INR&tn=Goa";

describe("the QR helper", () => {
  it("draws one square for every dark module of the link's code", () => {
    const { data, size } = encode(link, { ecc: "M", border: 2 });
    const squares = qrSquares(link);
    expect(squares.size).toBe(size);
    expect(squares.path.split("z").length - 1).toBe(data.flat().filter(Boolean).length);
  });

  it("is an inline SVG with an accessible name and no script", () => {
    const svg = qrSvg(link, 'UPI QR to pay ₹3,000 to "Sharma" & Sons');
    expect(svg).toMatch(/^<svg [^>]*role="img"/);
    expect(svg).toContain('aria-label="UPI QR to pay ₹3,000 to &quot;Sharma&quot; &amp; Sons"');
    expect(svg).not.toMatch(/<script|onload|href=/i);
  });
});
