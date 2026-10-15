// The web app manifest makes the app installable (DESIGN.md section 6: standalone, theme colour of the canvas) under
// the brand's name and with the brand's icons, read from the brand package (spec 10).
import { brand, pwaIcons } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("manifest", () => {
  it("installs the app under the brand's name, standalone, opening at home", () => {
    expect(manifest()).toMatchObject({
      id: "/",
      name: brand.productName,
      short_name: brand.shortName,
      description: brand.tagline,
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: brand.colours.canvas,
      background_color: brand.colours.canvas,
    });
  });

  it("lists the brand's icons: 192 and 512 pixels, and a maskable one", () => {
    const icons = manifest().icons ?? [];
    expect(icons).toEqual(pwaIcons.map((icon) => ({ ...icon })));
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });
});
