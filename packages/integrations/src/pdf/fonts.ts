// The brand's three typefaces for PDFs (spec 10), registered once per process from the @fontsource packages.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Font } from "@react-pdf/renderer";
import { brand } from "@travel-crm/brand";
import { sfntFromWoff } from "./woff.js";

const require = createRequire(import.meta.url);

const families = [
  { family: brand.fonts.title, fontPackage: "@fontsource/eb-garamond", file: "eb-garamond" },
  { family: brand.fonts.ui, fontPackage: "@fontsource/figtree", file: "figtree" },
  { family: brand.fonts.numbers, fontPackage: "@fontsource/ibm-plex-mono", file: "ibm-plex-mono" },
] as const;

const weights = [400, 600] as const;

/**
 * Each family comes in two files: "latin" has the digits but not ₹, "latin-ext" has ₹ and accented letters but no
 * digits. Both are registered, the second as "<family> Ext", and styles name both, so React-PDF takes each character
 * from the first file that has it.
 */
const extended = (family: string): string => `${family} Ext`;

export const fontStacks = {
  title: [brand.fonts.title, extended(brand.fonts.title)],
  ui: [brand.fonts.ui, extended(brand.fonts.ui)],
  numbers: [brand.fonts.numbers, extended(brand.fonts.numbers)],
};

/** A font file from an @fontsource package, unpacked to TrueType, as the data URL React-PDF accepts. */
function trueTypeDataUrl(fontPackage: string, fileName: string): string {
  const woff = readFileSync(require.resolve(`${fontPackage}/files/${fileName}`));
  return `data:font/ttf;base64,${Buffer.from(sfntFromWoff(woff)).toString("base64")}`;
}

let registered = false;

export function registerBrandFonts(): void {
  if (registered) return;
  for (const { family, fontPackage, file } of families) {
    for (const [name, subset] of [
      [family, "latin"],
      [extended(family), "latin-ext"],
    ] as const) {
      Font.register({
        family: name,
        fonts: weights.map((fontWeight) => ({
          src: trueTypeDataUrl(fontPackage, `${file}-${subset}-${String(fontWeight)}-normal.woff`),
          fontWeight,
        })),
      });
    }
  }
  // Never split a word across lines: a hyphen inside a name, a number or an amount would change what it says.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
