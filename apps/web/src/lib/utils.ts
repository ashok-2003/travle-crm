// Class-name merging for Tailwind (shadcn/ui's `cn`), taught the theme's own type sizes (globals.css's --text-*
// tokens): without them a size such as text-caption reads as a colour, and the colour beside it is dropped. Every
// component imports cn from here, the registry's included (test/lib/class-names.test.ts keeps both true).
import { createCn } from "cn/config";

/** The theme's type sizes: globals.css's --text-* tokens, DESIGN.md's type scale. */
const typeSizes = ["title", "title-mobile", "section", "body", "label", "caption", "number", "number-lg"];

export const cn = createCn({ extend: { theme: { text: typeSizes } } });
