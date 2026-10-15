// A logo's real type comes from its bytes, not from what the browser declared: storage checks only the declared one.
import { describe, expect, it } from "vitest";
import { imageTypeOf } from "../../src/pdf/index.js";
import { tinyJpeg, tinyPng } from "./logos.js";

describe("imageTypeOf", () => {
  it("knows a PNG and a JPEG by their signatures", () => {
    expect(imageTypeOf(tinyPng)).toBe("image/png");
    expect(imageTypeOf(tinyJpeg)).toBe("image/jpeg");
  });

  it("knows nothing else, nor a signature cut short", () => {
    expect(imageTypeOf(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(imageTypeOf(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(imageTypeOf(new Uint8Array())).toBeNull();
    expect(imageTypeOf(tinyPng.subarray(0, 7))).toBeNull();
    expect(imageTypeOf(tinyJpeg.subarray(0, 2))).toBeNull();
  });
});
