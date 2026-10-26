// The brand's three typefaces (brand.fonts), served from our own address: Figtree for the interface, EB Garamond
// for page titles, IBM Plex Mono for numbers. next/font preloads them and sizes a local fallback to match, so text
// doesn't jump when they arrive (DESIGN.md section 3). Each comes in two files: "latin" has the digits but not ₹,
// "latin-ext" has ₹ and accented letters. The second is limited to its characters by unicode-range, so it downloads
// only when a page shows one of them. globals.css puts each pair, then the Noto fonts for Indian scripts, in a stack.
// next/font needs every option written out as a literal, so the range is repeated.
import localFont from "next/font/local";

export const ui = localFont({
  src: "../../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
  weight: "300 900",
  variable: "--font-ui",
  adjustFontFallback: "Arial",
});

export const uiExtended = localFont({
  src: "../../node_modules/@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2",
  weight: "300 900",
  variable: "--font-ui-extended",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
});

export const title = localFont({
  src: "../../node_modules/@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2",
  weight: "400 800",
  variable: "--font-title",
  adjustFontFallback: "Times New Roman",
});

export const titleExtended = localFont({
  src: "../../node_modules/@fontsource-variable/eb-garamond/files/eb-garamond-latin-ext-wght-normal.woff2",
  weight: "400 800",
  variable: "--font-title-extended",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
});

export const numbers = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--font-numbers",
  // Only the pages that show a number need it: sign-in and offline do not, and their first paint is budgeted.
  preload: false,
  adjustFontFallback: "Arial",
});

export const numbersExtended = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-500-normal.woff2",
      weight: "500",
    },
  ],
  variable: "--font-numbers-extended",
  // Not preloaded, like the others: a page that shows a rupee or a number fetches the file it needs (the sign-in page shows
  // neither, and its first paint is budgeted).
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
});

/** Every font's CSS variable, for the <html> element. */
export const fontVariables = [ui, uiExtended, title, titleExtended, numbers, numbersExtended]
  .map((font) => font.variable)
  .join(" ");
