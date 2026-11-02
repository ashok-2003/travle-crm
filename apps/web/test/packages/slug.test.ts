// A package's address from its name: lower-case words joined by hyphens, never longer than the api takes.
import { packageSlug } from "@travel-crm/contracts/quotes";
import { describe, expect, it } from "vitest";
import { slugOf } from "@/packages/package-form";

describe("a package's address from its name", () => {
  it("joins the words with hyphens in lower case", () => {
    expect(slugOf("Kedarnath Yatra")).toBe("kedarnath-yatra");
    expect(slugOf("  Spiti: 7 days & 6 nights!  ")).toBe("spiti-7-days-6-nights");
    expect(slugOf("Goa—honeymoon")).toBe("goa-honeymoon");
  });

  it("is empty for a name with no letters or digits", () => {
    expect(slugOf("!!!")).toBe("");
    expect(slugOf("")).toBe("");
  });

  it("is always an address the api takes", () => {
    for (const name of ["Kedarnath Yatra", "A".repeat(100), "Ladakh 8 days, 7 nights (Leh and Nubra)", "x y"]) {
      const slug = slugOf(name);
      expect(slug.length).toBeLessThanOrEqual(60);
      expect(packageSlug.safeParse(slug).success, name).toBe(true);
    }
  });
});
