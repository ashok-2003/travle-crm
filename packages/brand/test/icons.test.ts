// The build turns the logo into the favicon, the home-screen icons and the PWA manifest's icons, at the right sizes.
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateIcons, icoFromPng } from "../scripts/render-icons.js";
import { brand, brandAssets, pwaIcons } from "../src/index.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A PNG's size and its top-left pixel. Only 8-bit RGBA, which is what the renderer writes. */
function readPng(png: Buffer): { width: number; height: number; topLeft: number[] } {
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect([png[24], png[25]]).toEqual([8, 6]); // bit depth 8, colour type 6 (RGBA)
  const pixelData: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString("latin1", offset + 4, offset + 8) === "IDAT") {
      pixelData.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }
  // The first row's first pixel is stored as is whatever the row's filter: there is no pixel left of or above it.
  const rows = inflateSync(Buffer.concat(pixelData));
  return { width, height, topLeft: [...rows.subarray(1, 5)] };
}

/** All pixels of an 8-bit RGBA PNG, with the row filters undone. Returns the pixel at (x, y) as [r, g, b, a]. */
function decodePng(png: Buffer): { width: number; height: number; pixel: (x: number, y: number) => number[] } {
  const { width, height } = readPng(png);
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString("latin1", offset + 4, offset + 8) === "IDAT")
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const out = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const byte = raw[row * (stride + 1) + 1 + i] ?? 0;
      const left = i >= 4 ? (out[row * stride + i - 4] ?? 0) : 0;
      const up = row > 0 ? (out[(row - 1) * stride + i] ?? 0) : 0;
      const upLeft = row > 0 && i >= 4 ? (out[(row - 1) * stride + i - 4] ?? 0) : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const [dLeft, dUp, dUpLeft] = [left, up, upLeft].map((value) => Math.abs(estimate - value)) as [
          number,
          number,
          number,
        ];
        predicted = dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
      }
      out[row * stride + i] = (byte + predicted) & 255;
    }
  }
  return { width, height, pixel: (x, y) => [...out.subarray(y * stride + x * 4, y * stride + x * 4 + 4)] };
}

/** "#1a1a1a" as an opaque RGBA pixel. */
const opaque = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).concat(255);

describe("generated icons", () => {
  let directory: string;
  let written: string[];
  const read = (fileName: string) => readFile(path.join(directory, fileName));

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "brand-icons-"));
    written = await generateIcons(directory);
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("writes the favicon, the home-screen icons and the manifest icons", async () => {
    const expected = [
      "apple-touch-icon.png",
      "favicon-32.png",
      "favicon.ico",
      "favicon.svg",
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-512.png",
    ];
    expect([...written].sort()).toEqual(expected);
    expect((await readdir(directory)).sort()).toEqual(expected);
  });

  it("renders each PNG at its size", async () => {
    const sizes = {
      "favicon-32.png": 32,
      "apple-touch-icon.png": 180,
      "icon-192.png": 192,
      "icon-512.png": 512,
      "icon-maskable-512.png": 512,
    };
    for (const [fileName, size] of Object.entries(sizes)) {
      const { width, height } = readPng(await read(fileName));
      expect([width, height], fileName).toEqual([size, size]);
    }
  });

  it("fills the maskable icon to its edges with ink, and the Apple icon with warm white", async () => {
    expect(readPng(await read("icon-maskable-512.png")).topLeft).toEqual(opaque(brand.colours.ink));
    expect(readPng(await read("apple-touch-icon.png")).topLeft).toEqual(opaque(brand.colours.canvas));
    // The plain icons keep the mark's rounded corners on a transparent background.
    expect(readPng(await read("icon-512.png")).topLeft[3]).toBe(0);
  });

  it("wraps the 32-pixel PNG in a valid .ico file", async () => {
    const ico = await read("favicon.ico");
    const png = await read("favicon-32.png");
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 1]);
    expect([ico[6], ico[7], ico.readUInt16LE(10), ico.readUInt16LE(12)]).toEqual([32, 32, 1, 32]);
    expect([ico.readUInt32LE(14), ico.readUInt32LE(18)]).toEqual([png.length, 22]);
    expect(ico.subarray(22).equals(png)).toBe(true);
  });

  it("copies the logo as the SVG favicon", async () => {
    expect(await read("favicon.svg")).toEqual(await readFile(brandAssets.logo));
  });

  it("draws the mark: the middle of each icon holds pixels unlike its corner", async () => {
    for (const fileName of [
      "favicon-32.png",
      "apple-touch-icon.png",
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-512.png",
    ]) {
      const { width, height, pixel } = decodePng(await read(fileName));
      const corner = pixel(0, 0).join();
      let differing = 0;
      for (let y = height >> 2; y < height - (height >> 2); y++) {
        for (let x = width >> 2; x < width - (width >> 2); x++) {
          if (pixel(x, y).join() !== corner) differing++;
        }
      }
      expect(differing, fileName).toBeGreaterThan(0);
    }
  });

  it("keeps the maskable icon's edges all ink, so the mark sits inside the safe zone", async () => {
    const { width, height, pixel } = decodePng(await read("icon-maskable-512.png"));
    const ink = opaque(brand.colours.ink);
    for (let i = 0; i < width; i++) {
      expect(pixel(i, 0)).toEqual(ink);
      expect(pixel(i, height - 1)).toEqual(ink);
      expect(pixel(0, i)).toEqual(ink);
      expect(pixel(width - 1, i)).toEqual(ink);
    }
  });

  it("clears stale files from the output folder", async () => {
    const stale = path.join(directory, "old-icon.png");
    await writeFile(stale, "stale");
    await generateIcons(directory);
    await expect(readFile(stale)).rejects.toThrow();
  });

  it("refuses an .ico size above 255", () => {
    expect(() => icoFromPng(new Uint8Array(1), 256)).toThrow(RangeError);
  });

  it("lists, for the PWA manifest, exactly the icons it wrote", async () => {
    for (const icon of pwaIcons) {
      const { width, height } = readPng(await read(path.basename(icon.src)));
      expect(icon.sizes).toBe(`${String(width)}x${String(height)}`);
    }
    expect(pwaIcons.map((icon) => icon.purpose)).toEqual(["any", "any", "maskable"]);
  });
});
