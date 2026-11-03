// Reading a rate sheet, the parts code does (release ai3b): a printed price as paise (lakh grouping, "4.5k", "-", ranges refused),
// the digits looked for in the sheet's own line, tax words kept as a note, dates made days, the model's answer made into rows
// with the sheet's words beside them, and a sheet divided into parts by tab or by pages.
import { createMemorySpreadsheets } from "@travel-crm/integrations/spreadsheets";
import { describe, expect, it } from "vitest";
import { parsePrintedPrice, numbersIn, priceInLine, taxWordsIn } from "../../src/ai/rates/price.js";
import { proposedRates } from "../../src/ai/rates/rows.js";
import { parsePrintedDay } from "../../src/ai/rates/season-dates.js";
import { excelParts, pdfParts } from "../../src/ai/rates/source.js";
import { tinyPdf } from "./support/tiny-pdf.js";

describe("a printed price as paise", () => {
  it.each([
    ["₹4,500", 450_000],
    ["4500/-", 450_000],
    ["Rs. 4,500 only", 450_000],
    ["12,50,000", 125_000_000],
    ["4500.50", 450_050],
    ["4.5k", 450_000],
    ["1.2 lakh", 12_000_000],
    ["2 cr", 2_000_000_000],
    ["₹4,500 +GST", 450_000],
  ])("reads %s", (printed, paise) => {
    expect(parsePrintedPrice(printed)).toBe(paise);
  });

  it.each([
    "-",
    "",
    "NA",
    "on request",
    "4500-5500",
    "4500 to 5500",
    "45,00",
    "0",
    "4.5555k",
    "₹ abc",
    "1,00,00,00,00,000",
  ])("is a question, not a guess, for %j", (printed) => {
    expect(parsePrintedPrice(printed)).toBeNull();
  });
});

describe("the printed number in the sheet's own line", () => {
  it("finds it with or without grouping and decimals, and not as a part of another number", () => {
    const line = "A: Deluxe room | B: MAP | C: 4,500.00 | D: 12";
    expect(numbersIn(line)).toEqual(new Set(["4500.00", "4500", "12"]));
    expect(priceInLine("₹4,500", line)).toBe(true);
    expect(priceInLine("4500/-", line)).toBe(true);
    expect(priceInLine("450", line)).toBe(false);
    expect(priceInLine("5,400", line)).toBe(false);
    expect(priceInLine("on request", line)).toBe(false);
  });

  it("keeps the tax words printed beside a price, once each", () => {
    expect(taxWordsIn("₹4,500 + GST", "Deluxe 4500 plus taxes, inclusive of breakfast")).toEqual([
      "+ GST",
      "plus taxes",
      "inclusive",
    ]);
    expect(taxWordsIn("₹4,500", "Deluxe 4500")).toEqual([]);
  });
});

describe("a season's printed dates", () => {
  it.each([
    ["1 Oct 2026", "2026-10-01"],
    ["15th December 2026", "2026-12-15"],
    ["Dec 15, 2026", "2026-12-15"],
    ["01/10/2026", "2026-10-01"],
    ["1.4.2027", "2027-04-01"],
    ["2026-10-01", "2026-10-01"],
  ])("reads %s", (printed, day) => {
    expect(parsePrintedDay(printed)).toBe(day);
  });

  it.each(["15 Dec", "31 Feb 2027", "", "Diwali 2026", "1 Foo 2026"])(
    "is null for %j: the person chooses it",
    (printed) => {
      expect(parsePrintedDay(printed)).toBeNull();
    },
  );
});

describe("the model's answer as rows", () => {
  const lines = new Map([
    ["L1", { token: "L1", text: "A: Deluxe room | B: MAP | C: 4,500 + GST", source: "Rates, row 2" }],
    ["L2", { token: "L2", text: "A: Suite | C: 7,000", source: "Rates, row 3" }],
    ["L3", { token: "L3", text: "A: Cottage | C: 3,000", source: "Rates, row 4" }],
  ]);
  const catalog = {
    seasons: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        label: "Winter",
        startsOn: "2026-10-01",
        endsOn: "2027-03-31",
        rates: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            item: "Deluxe Room",
            mealPlan: "MAP" as const,
            occupancy: "double" as const,
            unit: "per_room_night" as const,
            costPaise: 400_000,
            note: "",
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            item: "Suite",
            mealPlan: "" as const,
            occupancy: "" as const,
            unit: "per_room_night" as const,
            costPaise: 700_000,
            note: "",
          },
        ],
      },
    ],
  };

  const answer = {
    seasons: [
      { label: "Winter", from: "1 Oct 2026", to: "31 Mar 2027", line: "L1" },
      { label: "Summer", from: "1 Apr", to: "30 Jun", line: "L1" },
    ],
    rates: [
      {
        season: 0,
        item: "Deluxe room",
        mealPlan: "MAP",
        occupancy: "double",
        unit: "per_room_night",
        price: "4,500 + GST",
        note: "",
        line: "L1",
      },
      {
        season: 0,
        item: "Suite",
        mealPlan: "",
        occupancy: "",
        unit: "per_room_night",
        price: "₹7,000",
        note: "",
        line: "L2",
      },
      {
        season: 1,
        item: "Cottage",
        mealPlan: "XX",
        occupancy: "quad",
        unit: "",
        price: "3,000",
        note: "garden view",
        line: "L3",
      },
      {
        season: 7,
        item: "Cottage",
        mealPlan: "",
        occupancy: "",
        unit: "per_room_night",
        price: "9,999",
        note: "",
        line: "L3",
      },
      { season: 0, item: "Ghost", unit: "per_day", price: "5,000", line: "L99" },
      { season: 0, item: "No price", unit: "per_day", price: "" },
      { season: 0, item: "", price: "100" },
    ],
    questions: ["Is breakfast included?", ""],
  };

  it("keeps enums to the lists, makes paise and days, and takes the words and place from the sheet's own line", () => {
    const found = proposedRates(answer, { lines }, "2026-11-02", catalog);
    expect(found.seasons).toEqual([
      expect.objectContaining({
        ref: 0,
        label: "Winter",
        startsOn: "2026-10-01",
        endsOn: "2027-03-31",
        existingSeasonId: catalog.seasons[0]?.id,
        inPast: false,
      }),
      expect.objectContaining({
        ref: 1,
        label: "Summer",
        startsOn: null,
        endsOn: null,
        existingSeasonId: null,
        printed: "1 Apr to 30 Jun",
      }),
    ]);
    expect(found.rates.map((rate) => rate.ref)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
    const [deluxe, suite, cottage, stray, ghost] = found.rates;
    expect(deluxe).toMatchObject({
      seasonRef: 0,
      costPaise: 450_000,
      checkThis: false,
      note: "Printed: + GST",
      source: "Rates, row 2",
      excerpt: "A: Deluxe room | B: MAP | C: 4,500 + GST",
    });
    expect(suite).toMatchObject({
      costPaise: 700_000,
      checkThis: false,
      note: "",
      existing: { rateId: catalog.seasons[0]?.rates[1]?.id, costPaise: 700_000 },
    });
    expect(cottage).toMatchObject({
      seasonRef: 1,
      mealPlan: "",
      occupancy: "",
      unit: null,
      costPaise: 300_000,
      note: "garden view",
    });
    // A season that is not in the list is no season; a line the sheet does not have is "check this one".
    expect(stray?.seasonRef).toBeNull();
    expect(ghost).toMatchObject({ source: "", excerpt: "", checkThis: true });
    expect(found.questions).toEqual(["Is breakfast included?"]);
    expect(found.cut).toBe(false);
  });

  it("keeps the tax words in the note, never in the price", () => {
    const found = proposedRates(
      { seasons: [], rates: [{ item: "Deluxe room", unit: "per_room_night", price: "4,500", line: "L1" }] },
      { lines },
      "2026-11-02",
      catalog,
    );
    expect(found.rates[0]).toMatchObject({
      costPaise: 450_000,
      note: "Printed: + GST",
      checkThis: false,
      seasonRef: null,
    });
  });

  it("marks a row whose number is not in its line, and every photo row, as one to check; shows the old price of a rate that is there", () => {
    const wrong = proposedRates(
      {
        seasons: [{ label: "Winter", from: "2026-10-01", to: "2027-03-31" }],
        rates: [{ item: "Suite", unit: "per_room_night", price: "7,500", line: "L2" }],
      },
      { lines },
      "2026-11-02",
      catalog,
    );
    expect(wrong.rates[0]).toMatchObject({ checkThis: true, seasonRef: 0, existing: { costPaise: 700_000 } });
    const photo = proposedRates(
      {
        seasons: [],
        rates: [
          { item: "Suite", unit: "per_day", price: "7,500", photo: 2 },
          { item: "Cab", unit: "per_day", price: "1,000", photo: 9 },
        ],
      },
      { photos: 2 },
      "2026-11-02",
      catalog,
    );
    expect(photo.rates.map((rate) => [rate.source, rate.checkThis])).toEqual([
      ["Photo 2", true],
      ["", true],
    ]);
  });

  it("flags a season that has ended, drops one that ends before it starts, and cuts at sixty rows", () => {
    const found = proposedRates(
      {
        seasons: [
          { label: "Old", from: "1 Jan 2026", to: "31 Mar 2026" },
          { label: "Backwards", from: "1 Jan 2027", to: "31 Mar 2026" },
        ],
        rates: Array.from({ length: 65 }, (_, index) => ({
          item: `Room ${String(index)}`,
          unit: "per_day",
          price: "1,000",
        })),
      },
      { photos: 1 },
      "2026-11-02",
      catalog,
    );
    expect(found.seasons[0]).toMatchObject({ inPast: true, startsOn: "2026-01-01" });
    expect(found.seasons[1]).toMatchObject({ startsOn: null, endsOn: null });
    expect(found.rates).toHaveLength(60);
    expect(found.cut).toBe(true);
  });
});

describe("a sheet divided into parts", () => {
  const spreadsheets = createMemorySpreadsheets();
  const rowsOf = (count: number, price: number) =>
    Array.from({ length: count }, (_, index) => [`Room ${String(index + 1)}`, "MAP", String(price + index)]);

  it("reads each tab of a workbook as a part, with the cell letters and the row's place, and skips an empty tab", async () => {
    const bytes = spreadsheets.bytesOf({
      sheetName: "Hotel",
      header: ["Room", "Plan", "Rate"],
      rows: [["Deluxe", "MAP", "4,500"]],
      more: [
        { sheetName: "Empty", header: [null], rows: [] },
        { sheetName: "Transport", header: ["Vehicle", "Rate"], rows: [["Innova", "3,000"]] },
      ],
    });
    const parts = await excelParts(spreadsheets, bytes);
    expect(parts.map((part) => part.label)).toEqual(["Hotel", "Transport"]);
    expect(parts[0]?.lines).toEqual([
      { token: "L1", text: "A: Room | B: Plan | C: Rate", source: "Hotel, row 1" },
      { token: "L2", text: "A: Deluxe | B: MAP | C: 4,500", source: "Hotel, row 2" },
    ]);
    expect(parts[1]?.lines[1]).toEqual({ token: "L2", text: "A: Innova | B: 3,000", source: "Transport, row 2" });
  });

  it("reads every tab of a workbook of more than twelve, and refuses one with too many rather than drop tabs", async () => {
    const tab = (n: number) => ({
      sheetName: `Tab ${String(n)}`,
      header: ["Room", "Rate"],
      rows: [[`Room ${String(n)}`, "1,000"]],
    });
    const many = (count: number) =>
      spreadsheets.bytesOf({ ...tab(1), more: Array.from({ length: count - 1 }, (_, index) => tab(index + 2)) });
    const parts = await excelParts(spreadsheets, many(15));
    expect(parts.map((part) => part.label)).toEqual(
      Array.from({ length: 15 }, (_, index) => `Tab ${String(index + 1)}`),
    );
    await expect(excelParts(spreadsheets, many(41))).rejects.toMatchObject({ reason: "RATE_SHEET_TOO_BIG" });
  });

  it("divides a tab that is too long into row ranges", async () => {
    const bytes = spreadsheets.bytesOf({ header: ["Room", "Plan", "Rate"], rows: rowsOf(400, 1000) });
    const parts = await excelParts(spreadsheets, bytes);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts[0]?.label).toMatch(/^Sheet1, rows 1-\d+$/);
    expect(parts.reduce((total, part) => total + part.lines.length, 0)).toBe(401);
    expect(parts.every((part) => part.lines.length <= 150)).toBe(true);
  });

  it("reads a PDF page by page and names the pages of each part; a scan with no words asks for photos", async () => {
    const parts = await pdfParts(tinyPdf([["Deluxe room MAP 4500", "Suite 7000"], ["Transport Innova 3000"]]));
    expect(parts).toHaveLength(1);
    expect(parts[0]?.label).toBe("Pages 1-2");
    expect(parts[0]?.lines.map((line) => [line.source, line.text])).toEqual([
      ["Page 1", "Deluxe room MAP 4500"],
      ["Page 1", "Suite 7000"],
      ["Page 2", "Transport Innova 3000"],
    ]);
    await expect(pdfParts(tinyPdf([[""]]))).rejects.toMatchObject({ reason: "RATE_SHEET_SCANNED" });
    await expect(pdfParts(new TextEncoder().encode("not a pdf"))).rejects.toMatchObject({
      reason: "RATE_SHEET_UNREADABLE",
    });
  });

  it("divides a long PDF into parts of pages", async () => {
    const page = (n: number) =>
      Array.from({ length: 40 }, (_, line) => `Room ${String(n)}-${String(line)} MAP double ${"x".repeat(60)} 4500`);
    const parts = await pdfParts(tinyPdf([page(1), page(2), page(3), page(4)]));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]?.label).toMatch(/^Pages? 1/);
  });
});
