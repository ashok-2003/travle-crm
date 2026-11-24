// The root layout's metadata for an installed iPhone app: a solid status bar (the pages do not pad for the notch).
import { appleStartupImages } from "@travel-crm/brand";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/fonts", () => ({ fontVariables: "" }));
vi.mock("@/app/globals.css", () => ({}));

describe("root layout metadata", () => {
  it("keeps the iPhone status bar solid and gives every startup image", async () => {
    const { metadata } = await import("@/app/layout");
    expect(metadata.appleWebApp).toMatchObject({ capable: true, statusBarStyle: "default" });
    expect(metadata.appleWebApp).toMatchObject({ startupImage: appleStartupImages.map((image) => ({ ...image })) });
  });
});
