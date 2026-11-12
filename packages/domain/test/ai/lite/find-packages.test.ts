// Finding packages from a customer's words: whole words are a match, a near spelling is only ever "closest".
import { describe, expect, it } from "vitest";
import { findPackages } from "../../../src/ai/lite/lookups/find-packages.js";
import type { PackageIndexEntry } from "../../../src/ai/lite/types.js";

const entry = (id: string, title: string, place: string | null): PackageIndexEntry => ({
  id,
  title,
  place,
  destinationId: null,
  nights: 4,
  startCity: "Delhi",
});
const kedarnath = entry("k", "Kedarnath Yatra 4N", "Kedarnath");
const spiti = entry("s", "Spiti Valley Circuit", "Spiti Valley");
const index = [kedarnath, spiti];

describe("finding packages", () => {
  it("Kedarnath finds Kedarnath Yatra 4N", () => {
    expect(findPackages(index, "Kedarnath")).toEqual({ exact: [kedarnath], closest: [] });
    expect(findPackages(index, "the Kedarnath tour package 4N")).toEqual({ exact: [kedarnath], closest: [] });
  });

  it("Kedarkantha is no match, and Kedarnath is the closest", () => {
    expect(findPackages(index, "Kedarkantha")).toEqual({ exact: [], closest: [kedarnath] });
  });

  it("spiti valley trip finds a Spiti package", () => {
    expect(findPackages(index, "spiti valley trip")).toEqual({ exact: [spiti], closest: [] });
  });

  it("xyz finds nothing, and a short word allows one wrong letter only", () => {
    expect(findPackages(index, "xyz")).toEqual({ exact: [], closest: [] });
    expect(findPackages(index, "spity").closest).toEqual([spiti]);
    expect(findPackages(index, "spxty")).toEqual({ exact: [], closest: [] });
  });
});
