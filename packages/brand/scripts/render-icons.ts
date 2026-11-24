// Renders the favicon, the home-screen icons, the PWA manifest's icons and the iPhone startup images from assets/logo.svg (spec 10).
// Build-time only: it uses @resvg/resvg-js, a dev dependency, which is why it lives outside src/.
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { brandAssets } from "../src/assets.js";
import { brand } from "../src/brand.js";
import { appleStartupFileName, appleStartupScreens, type AppleStartupScreen } from "../src/icons.js";

interface PngIcon {
  fileName: string;
  /** Width and height in pixels. */
  size: number;
  /** A colour behind the mark, or null to keep it transparent. */
  background: string | null;
  /** How much of the side the mark fills, centred. */
  markScale: number;
}

const pngIcons: readonly PngIcon[] = [
  { fileName: "favicon-32.png", size: 32, background: null, markScale: 1 },
  // iOS puts home-screen icons on its own rounded square and fills transparency with black: give it the page colour.
  { fileName: "apple-touch-icon-v2.png", size: 180, background: brand.colours.canvas, markScale: 0.8 },
  { fileName: "icon-192-v2.png", size: 192, background: null, markScale: 1 },
  { fileName: "icon-512-v2.png", size: 512, background: null, markScale: 1 },
  // Devices crop maskable icons to their own shape, keeping only the central 80 % (the safe zone) for sure.
  { fileName: "icon-maskable-512-v2.png", size: 512, background: brand.colours.ink, markScale: 0.8 },
];

const FAVICON_SIZE = 32;

/** The logo's viewBox and drawing, so the mark can be placed inside a larger canvas. */
function parseLogo(svg: string): { viewBox: string; drawing: string } {
  const match = /<svg\b[^>]*\bviewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>\s*$/.exec(svg);
  if (!match?.[1] || match[2] === undefined) throw new Error("The logo must be an <svg> with a viewBox");
  return { viewBox: match[1], drawing: match[2] };
}

function iconSvg(logo: { viewBox: string; drawing: string }, icon: PngIcon): string {
  const side = icon.size;
  const markSide = side * icon.markScale;
  const offset = (side - markSide) / 2;
  const background = icon.background
    ? `<rect width="${String(side)}" height="${String(side)}" fill="${icon.background}"/>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(side)}" height="${String(side)}" viewBox="0 0 ${String(side)} ${String(side)}">` +
    background +
    `<svg x="${String(offset)}" y="${String(offset)}" width="${String(markSide)}" height="${String(markSide)}" viewBox="${logo.viewBox}">` +
    logo.drawing +
    "</svg></svg>"
  );
}

/** The mark's share of an iPhone startup image's width. */
const STARTUP_MARK_WIDTH_SHARE = 1 / 3;
/** The logo's petals span about this much of its viewBox's side (42 of 64 units, stroke included). */
const PETALS_SHARE_OF_LOGO = 42 / 64;

/** A startup image: the brand's ink all over, the petals alone (no rounded tile) centred. */
function startupSvg(logo: { viewBox: string; drawing: string }, screen: AppleStartupScreen): string {
  const side = (screen.width * STARTUP_MARK_WIDTH_SHARE) / PETALS_SHARE_OF_LOGO;
  // The logo's first shape is its ink tile; the petals after it are warm white and stand on their own.
  const petals = logo.drawing.replace(/<path\b[^>]*\/>/, "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(screen.width)}" height="${String(screen.height)}" viewBox="0 0 ${String(screen.width)} ${String(screen.height)}">` +
    `<rect width="${String(screen.width)}" height="${String(screen.height)}" fill="${brand.colours.ink}"/>` +
    `<svg x="${String((screen.width - side) / 2)}" y="${String((screen.height - side) / 2)}" width="${String(side)}" height="${String(side)}" viewBox="${logo.viewBox}">` +
    petals +
    "</svg></svg>"
  );
}

/**
 * An .ico file holding one PNG image, which every current browser reads: a 6-byte header (reserved, type 1 for
 * icons, one image), one 16-byte directory entry (size, colour planes, bits per pixel, length, offset 22), the PNG.
 */
export function icoFromPng(png: Uint8Array, size: number): Uint8Array {
  // ICO stores 256 as 0 and we only ever write the 32-pixel favicon, so larger sizes are refused.
  if (size > 255) throw new RangeError(`An .ico entry holds at most 255 pixels here, got ${String(size)}`);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt8(0, 8); // no palette
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

/** Writes every icon into outputDirectory (emptied first, created if missing) and returns the file names written. */
export async function generateIcons(outputDirectory: string): Promise<string[]> {
  // Start clean so a renamed or removed icon leaves no stale file. Only this folder is removed.
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const logo = parseLogo(await readFile(brandAssets.logo, "utf8"));
  const written: string[] = [];

  for (const icon of pngIcons) {
    const png = new Resvg(iconSvg(logo, icon), {
      // The logo has no text; never read system fonts, so the output is the same on every machine.
      font: { loadSystemFonts: false },
    })
      .render()
      .asPng();
    await writeFile(path.join(outputDirectory, icon.fileName), png);
    written.push(icon.fileName);
    if (icon.size === FAVICON_SIZE) {
      await writeFile(path.join(outputDirectory, "favicon.ico"), icoFromPng(png, FAVICON_SIZE));
      written.push("favicon.ico");
    }
  }
  for (const screen of appleStartupScreens) {
    const fileName = appleStartupFileName(screen);
    const png = new Resvg(startupSvg(logo, screen), { font: { loadSystemFonts: false } }).render().asPng();
    await writeFile(path.join(outputDirectory, fileName), png);
    written.push(fileName);
  }
  // Browsers that read SVG favicons get the logo itself, sharp at any size.
  await copyFile(brandAssets.logo, path.join(outputDirectory, "favicon.svg"));
  written.push("favicon.svg");
  return written;
}
