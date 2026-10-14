// Renders the favicon, the home-screen icons and the PWA manifest's icons from assets/logo.svg (spec 10).
// Build-time only: it uses @resvg/resvg-js, a dev dependency, which is why it lives outside src/.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { brandAssets } from "../src/assets.js";
import { brand } from "../src/brand.js";

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
  { fileName: "apple-touch-icon.png", size: 180, background: brand.colours.canvas, markScale: 0.8 },
  { fileName: "icon-192.png", size: 192, background: null, markScale: 1 },
  { fileName: "icon-512.png", size: 512, background: null, markScale: 1 },
  // Devices crop maskable icons to their own shape, keeping only the central 80 % (the safe zone) for sure.
  { fileName: "icon-maskable-512.png", size: 512, background: brand.colours.ink, markScale: 0.8 },
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

/**
 * An .ico file holding one PNG image, which every current browser reads: a 6-byte header (reserved, type 1 for
 * icons, one image), one 16-byte directory entry (size, colour planes, bits per pixel, length, offset 22), the PNG.
 */
export function icoFromPng(png: Uint8Array, size: number): Uint8Array {
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

/** Writes every icon into outputDirectory (created if missing) and returns the file names written. */
export async function generateIcons(outputDirectory: string): Promise<string[]> {
  await mkdir(outputDirectory, { recursive: true });
  const logo = parseLogo(await readFile(brandAssets.logo, "utf8"));
  const written: string[] = [];

  for (const icon of pngIcons) {
    const png = new Resvg(iconSvg(logo, icon)).render().asPng();
    await writeFile(path.join(outputDirectory, icon.fileName), png);
    written.push(icon.fileName);
    if (icon.size === FAVICON_SIZE) {
      await writeFile(path.join(outputDirectory, "favicon.ico"), icoFromPng(png, FAVICON_SIZE));
      written.push("favicon.ico");
    }
  }
  // Browsers that read SVG favicons get the logo itself, sharp at any size.
  await copyFile(brandAssets.logo, path.join(outputDirectory, "favicon.svg"));
  written.push("favicon.svg");
  return written;
}
