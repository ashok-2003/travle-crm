// Season words: a column's ranges joined with "and", as the header, the legend and the day panel read them.
import type { SeasonColumn } from "@travel-crm/contracts/quotes";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { seasonDates } from "@/packages/season-words";

const t = createTranslator({ locale, messages, namespace: "packages.departuresCalendar" });
const column = {
  label: "Regular",
  open: false,
  ranges: [
    { startsOn: "2026-11-21", endsOn: "2026-12-18" },
    { startsOn: "2027-01-06", endsOn: "2027-12-18" },
  ],
} as unknown as SeasonColumn;

describe("seasonDates", () => {
  it("joins two ranges with and", () => {
    expect(seasonDates(t, column, [column])).toBe("21 Nov to 18 Dec and 6 Jan 2027 to 18 Dec 2027");
  });
  it("reads in the legend as the label, a dot and the ranges", () => {
    expect(t("legendRanges", { label: "Regular", ranges: seasonDates(t, column, [column]) })).toBe(
      "Regular · 21 Nov to 18 Dec and 6 Jan 2027 to 18 Dec 2027",
    );
  });
});
