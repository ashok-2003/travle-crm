// Colours and fonts for one organization's documents: the brand's tokens, with the organization's accent colour.
import { brand } from "@travel-crm/brand";
import type { DocumentBranding } from "./document-input.js";
import { fontStacks } from "./fonts.js";

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

export interface PdfTheme {
  accent: string;
  ink: string;
  muted: string;
  surface: string;
  hairline: string;
  money: string;
  fonts: typeof fontStacks;
}

export function pdfTheme(branding: DocumentBranding): PdfTheme {
  const accent = branding.accentColour ?? brand.colours.action;
  // The colour is written into the PDF's drawing commands, so only a plain hex colour gets through.
  if (!HEX_COLOUR.test(accent)) {
    throw new RangeError(`Accent colours look like #1a2b3c, got ${JSON.stringify(accent.slice(0, 20))}`);
  }
  return {
    accent,
    ink: brand.colours.ink,
    muted: brand.colours.muted,
    surface: brand.colours.surface,
    hairline: brand.colours.hairline,
    money: brand.colours.money,
    fonts: fontStacks,
  };
}
