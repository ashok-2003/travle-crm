// The customer's pages share one look (spec 2026-11-27, customer pages polish): the brand's three typefaces from the web
// app's own /fonts, the brand's colours and nothing else, status pills that say their state in words, a bar on a phone
// with the page's one main action, and a policy that loads nothing from another origin.
import { brand } from "@travel-crm/brand";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bottomBar, document, pill, securityHeaders, styles } from "../src/public-html.js";

const brandColours = new Set(
  JSON.stringify(brand.colours)
    .match(/#[0-9a-f]{6}/gi)
    ?.map((hex) => hex.toLowerCase()),
);

describe("the customer pages' look", () => {
  it("declares the brand's three typefaces, each a Latin and an extended file from /fonts, swapped in when they arrive", () => {
    const css = styles();
    const faces = css.match(/@font-face\{[^}]*\}/g) ?? [];
    for (const family of [brand.fonts.ui, brand.fonts.title, brand.fonts.numbers]) {
      const mine = faces.filter((face) => face.includes(`font-family:"${family}"`));
      expect(mine.length).toBeGreaterThanOrEqual(2);
      for (const face of mine) {
        expect(face).toMatch(/src:url\("\/fonts\/[a-z0-9-]+\.woff2"\) format\("woff2"\)/);
        expect(face).toContain("font-display:swap");
        expect(face).toContain("unicode-range:");
      }
    }
    // The rupee sign is in the extended files only.
    expect(faces.filter((face) => face.includes("latin-ext")).every((face) => face.includes("U+20AD-20C0"))).toBe(true);
  });

  it("falls back to the device's own fonts, and keeps the title font for the title and the numbers font for amounts", () => {
    const css = styles();
    expect(css).toMatch(new RegExp(`--ui:"${brand.fonts.ui}",system-ui`));
    expect(css).toMatch(/h1\{[^}]*font-family:var\(--title\)/);
    expect(css).toMatch(/\.amount[^{]*\{[^}]*font-family:var\(--numbers\)/);
    expect(css).not.toMatch(/body\{[^}]*--numbers/);
  });

  it("uses the brand's colours and no other", () => {
    const colours = styles().match(/#[0-9a-f]{3,8}\b/gi) ?? [];
    expect(colours.length).toBeGreaterThan(10);
    expect(colours.filter((colour) => !brandColours.has(colour.toLowerCase()))).toEqual([]);
  });

  it("types no colour in the pages' code: every one comes from the brand", () => {
    for (const file of ["public-html.ts", "quote-page.ts", "trip-page.ts", "trip-forms.ts"]) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
      expect(source.match(/(?<![&\w])#[0-9a-f]{3,8}\b/gi), file).toBeNull();
    }
  });

  it("says a status with a dot and its word, in the tone of its meaning", () => {
    expect(pill("good", "Paid")).toBe('<span class="pill good">Paid</span>');
    expect(pill("bad", "Overdue <now>")).toBe('<span class="pill bad">Overdue &lt;now&gt;</span>');
    const css = styles();
    expect(css).toMatch(/\.pill::before\{[^}]*content:""/);
    expect(css).toContain(`--good-fill:${brand.colours.status.good.fill}`);
    expect(css).toContain(`--bad-ink:${brand.colours.status.bad.ink}`);
  });

  it("puts the page's one main action in a bar at the foot of a phone's screen, and pads the page so it covers nothing", () => {
    const bar = bottomBar({ href: "#accept", words: "Accept quote" });
    expect(bar).toContain('<a class="button" href="#accept">Accept quote</a>');
    const html = document({ title: "Goa", agencyName: "Sharma Holidays", body: "<p>Hi</p>", bar });
    expect(html).toContain('<html lang="en" class="with-bar">');
    expect(html.indexOf("</main>")).toBeLessThan(html.indexOf('class="bar"'));
    const css = styles();
    expect(css).toMatch(/\.bar\{[^}]*position:fixed/);
    expect(css).toMatch(/\.with-bar main\{[^}]*padding-bottom/);
    // A desktop has the action on the page itself.
    expect(css).toMatch(/@media \(min-width:48rem\)\{[^@]*\.bar\{display:none\}/);
    expect(document({ title: "Goa", agencyName: "Sharma Holidays", body: "" })).toContain('<html lang="en">');
  });

  it("allows its own fonts and loads nothing from another origin", () => {
    for (const security of [{ forms: true }, { forms: false }, { forms: true, nonce: "abc", storageOrigin: null }]) {
      const policy = securityHeaders(security)["Content-Security-Policy"];
      expect(policy).toContain("default-src 'none'");
      expect(policy).toContain("font-src 'self'");
      expect(policy).not.toMatch(/https?:/);
    }
  });
});
