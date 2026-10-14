// The email layout escapes every value, shows the action as a button and a plain link, and names the product.
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import { renderEmail, senderNameFor } from "../../src/email/index.js";

describe("renderEmail", () => {
  it("lays out the heading, paragraphs, action and footer in HTML and plain text", () => {
    const { html, text } = renderEmail({
      heading: "Your quotation was opened",
      paragraphs: ["Meera opened Quotation QT-2026-0042.", "Follow up while it is fresh."],
      action: { label: "Open the quotation", url: "https://app.example/quotes/42" },
      footer: "You get these because you shared the link.",
    });

    expect(html).toContain("Your quotation was opened");
    expect(html).toContain('href="https://app.example/quotes/42"');
    expect(html).toContain(brand.colours.action);
    expect(html).toContain(brand.productName);
    expect(text).toBe(
      [
        "Your quotation was opened",
        "",
        "Meera opened Quotation QT-2026-0042.",
        "",
        "Follow up while it is fresh.",
        "",
        "Open the quotation: https://app.example/quotes/42",
        "",
        "--",
        "You get these because you shared the link.",
        `Sent with ${brand.productName}`,
      ].join("\n"),
    );
  });

  it("escapes HTML in every value", () => {
    const { html } = renderEmail({
      heading: "<script>alert(1)</script>",
      paragraphs: ['Tom & "Jerry" <b>'],
      action: { label: "<i>Open</i>", url: "https://app.example/?a=1&b=<2>" },
      footer: "<footer>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Tom &amp; &quot;Jerry&quot; &lt;b&gt;");
    expect(html).toContain('href="https://app.example/?a=1&amp;b=&lt;2&gt;"');
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<footer>");
  });

  it("refuses an action that isn't an http(s) link", () => {
    const content = { heading: "x", paragraphs: [], footer: "y" };
    expect(() => renderEmail({ ...content, action: { label: "Open", url: "javascript:alert(1)" } })).toThrow(/http/);
    expect(() => renderEmail({ ...content, action: { label: "Open", url: "/relative" } })).toThrow(/http/);
  });

  it("names the sender as the organization via the product, on one line", () => {
    expect(senderNameFor("Sharma Travels")).toBe(`Sharma Travels via ${brand.emailSenderName}`);
    expect(senderNameFor(" Sharma\n  Travels ")).toBe(`Sharma Travels via ${brand.emailSenderName}`);
  });
});
