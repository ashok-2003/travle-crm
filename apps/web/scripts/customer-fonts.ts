// The fonts of the customer's pages at /p/<token> (the quote and the trip page): the api writes those pages, but they are
// served on the web app's address, so the brand's three typefaces are copied to public/fonts, where the pages'
// @font-face rules (apps/api/src/public-html.ts) ask for them. Each is a Latin file and an extended one, which has ₹.
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

/** The files, from the font packages the web app itself uses (src/app/fonts.ts). */
const sources = [
  "@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
  "@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2",
  "@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2",
  "@fontsource-variable/eb-garamond/files/eb-garamond-latin-ext-wght-normal.woff2",
  "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
  "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-400-normal.woff2",
  "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2",
  "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-500-normal.woff2",
];

const modules = path.resolve(import.meta.dirname, "../node_modules");

/** Replaces targetDirectory with a copy of the fonts and returns the file names copied. */
export async function copyCustomerFonts(targetDirectory: string): Promise<string[]> {
  await rm(targetDirectory, { recursive: true, force: true });
  await mkdir(targetDirectory, { recursive: true });
  await Promise.all(
    sources.map((source) => cp(path.join(modules, source), path.join(targetDirectory, path.basename(source)))),
  );
  return sources.map((source) => path.basename(source)).sort();
}
