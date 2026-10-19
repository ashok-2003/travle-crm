// Reading a row into an enquiry (bulk plan, Task 1.2; Review Focus 1, 5): the person and contacts, the trip, the
// stage and owner, the source, the enquiry date at the agency's midnight, and what can't be read kept in the note.
import type { LeadStage } from "@travel-crm/contracts/crm";
import type { ImportField } from "@travel-crm/contracts/imports";
import { describe, expect, it } from "vitest";
import { readLeadRow, type LeadRowContext } from "../../../src/crm/lead-import/lead-row.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const ASHA = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";

/** A context whose columns are the fields in order; null leaves a column unmatched. */
function contextOf(fields: readonly (ImportField | null)[], overrides: Partial<LeadRowContext> = {}): LeadRowContext {
  const fieldOf = new Map(fields.flatMap((field, position) => (field === null ? [] : [[position, field] as const])));
  return {
    columns: {
      fieldOf,
      positionsOf: (field) => [...fieldOf].filter(([, matched]) => matched === field).map(([position]) => position),
    },
    headers: fields.map((field, position) => (field === "note" ? "Remarks" : `Column ${String(position)}`)),
    ownerOf: (value) => (value.toLowerCase() === "asha" ? ASHA : null),
    stageOf: (value) =>
      (({ booked: "won", called: "contacted", junk: "not_a_lead" }) as Record<string, LeadStage>)[
        value.toLowerCase()
      ] ?? null,
    defaults: { stage: "new", ownerUserId: OWNER, budgetBasis: "for_everyone" },
    fileName: "enquiries-oct-2026.xlsx",
    today: parseCalendarDate("2026-10-19"),
    timeZone: "Asia/Kolkata",
    ...overrides,
  };
}

const row = (...cells: (string | null)[]) => ({ rowNumber: 2, cells });
const read = (fields: (ImportField | null)[], cells: (string | null)[], overrides: Partial<LeadRowContext> = {}) =>
  readLeadRow(row(...cells), contextOf(fields, overrides));

function enquiryOf(reading: ReturnType<typeof readLeadRow>) {
  if (reading.kind !== "enquiry") throw new Error(`Not added: ${JSON.stringify(reading)}`);
  return reading;
}

describe("reading a lead row", () => {
  it("reads 98765 43210, 09876543210, 919876543210, +91-98765-43210 and an Excel number as +919876543210", () => {
    for (const phone of ["98765 43210", "09876543210", "919876543210", "+91-98765-43210", "919876543210"]) {
      expect(enquiryOf(read(["name", "phone"], ["Asha Rao", phone])).contacts.phone).toBe("+919876543210");
    }
  });

  it("lower-cases an email and drops a handle's @", () => {
    const reading = enquiryOf(read(["name", "email", "instagram"], ["Asha", "Asha.Rao@Example.com", "@Asha.Travels"]));
    expect(reading.contacts).toEqual({ phone: null, email: "asha.rao@example.com", instagramHandle: "asha.travels" });
    expect(
      enquiryOf(read(["name", "instagram"], ["Asha", "https://www.instagram.com/asha.travels/"])).contacts,
    ).toMatchObject({ instagramHandle: "asha.travels" });
  });

  it("reads dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, '16 Oct 2026' and date cells", () => {
    for (const text of ["16/12/2026", "16-12-2026", "2026-12-16", "16 Dec 2026"]) {
      const { enquiry } = enquiryOf(read(["name", "phone", "travel_from"], ["Asha", "9876543210", text]));
      expect(enquiry.trip.when).toEqual({ kind: "dates", from: "2026-12-16", to: "2026-12-16" });
    }
  });

  it("reads 10/12/2026 as 10 Dec 2026, never 12 Oct", () => {
    const { enquiry } = enquiryOf(read(["name", "phone", "travel_from"], ["Asha", "9876543210", "10/12/2026"]));
    expect(enquiry.trip.when).toEqual({ kind: "dates", from: "2026-12-10", to: "2026-12-10" });
  });

  it("keeps 45941 in a date column as 'Travel date: 45941' in the note", () => {
    const reading = enquiryOf(read(["name", "phone", "travel_from"], ["Asha", "9876543210", "45941"]));
    expect(reading.enquiry.note).toBe("Travel date: 45941");
    expect(reading.enquiry.trip.when).toEqual({ kind: "unknown" });
    expect(reading.noted).toBe(true);
  });

  it("reads Dec 2026, December 2026, 12/2026 and 2026-12 as a month, and flexible, open or not fixed as flexible", () => {
    for (const text of ["Dec 2026", "December 2026", "12/2026", "2026-12"]) {
      const { enquiry } = enquiryOf(read(["name", "phone", "travel_month"], ["Asha", "9876543210", text]));
      expect(enquiry.trip.when).toEqual({ kind: "month", month: "2026-12" });
    }
    for (const text of ["flexible", "open", "not fixed"]) {
      const { enquiry } = enquiryOf(read(["name", "phone", "travel_month"], ["Asha", "9876543210", text]));
      expect(enquiry.trip.when).toEqual({ kind: "flexible" });
    }
  });

  it("makes Travel from alone a one-day trip, and reads both ends", () => {
    const both = enquiryOf(
      read(["name", "phone", "travel_from", "travel_to"], ["Asha", "9876543210", "16/12/2026", "22/12/2026"]),
    );
    expect(both.enquiry.trip.when).toEqual({ kind: "dates", from: "2026-12-16", to: "2026-12-22" });
    const backwards = enquiryOf(
      read(["name", "phone", "travel_from", "travel_to"], ["Asha", "9876543210", "16/12/2026", "10/12/2026"]),
    );
    expect(backwards.enquiry.trip.when).toEqual({ kind: "dates", from: "2026-12-16", to: "2026-12-16" });
    expect(backwards.enquiry.note).toBe("Travel end date: 10/12/2026");
  });

  it("reads ₹1,50,000, Rs 150000, INR 1.5 lakh, 150k, 1.5 L, 2 lac, 1 Cr and 1 crore in rupees", () => {
    const paise = (text: string) =>
      enquiryOf(read(["name", "phone", "budget"], ["Asha", "9876543210", text])).enquiry.trip.budget?.amount
        .amountPaise;
    expect(["₹1,50,000", "Rs 150000", "INR 1.5 lakh", "150k", "1.5 L"].map(paise)).toEqual(Array(5).fill(15_000_000));
    expect([paise("2 lac"), paise("1 Cr"), paise("1 crore")]).toEqual([20_000_000, 1_000_000_000, 1_000_000_000]);
  });

  it("takes the budget basis from its cell, else the file's answer, and keeps an unreadable budget in the note", () => {
    const fields: (ImportField | null)[] = ["name", "phone", "budget", "budget_basis"];
    expect(enquiryOf(read(fields, ["Asha", "9876543210", "50000", "per person"])).enquiry.trip.budget?.basis).toBe(
      "per_person",
    );
    expect(enquiryOf(read(fields, ["Asha", "9876543210", "50000", null])).enquiry.trip.budget?.basis).toBe(
      "for_everyone",
    );
    const defaults = { stage: "new" as const, ownerUserId: OWNER, budgetBasis: "per_person" as const };
    expect(
      enquiryOf(read(fields, ["Asha", "9876543210", "50000", null], { defaults })).enquiry.trip.budget?.basis,
    ).toBe("per_person");
    expect(enquiryOf(read(fields, ["Asha", "9876543210", "lots", null])).enquiry.note).toBe("Budget: lots");
  });

  it("reads 'Honeymoon', '4 star', 'Jain' and stage words, case ignored", () => {
    const reading = enquiryOf(
      read(
        ["name", "phone", "trip_type", "hotel_category", "food", "stage"],
        ["Asha", "9876543210", "HONEYMOON", "4 Star", "jain", "Booked"],
      ),
    );
    expect(reading.enquiry.trip).toMatchObject({ tripType: "honeymoon", hotelCategory: "4_star", food: "jain" });
    expect(reading.stage).toBe("won");
    const odd = enquiryOf(read(["name", "phone", "trip_type"], ["Asha", "9876543210", "adventure"]));
    expect(odd.enquiry.note).toBe("Trip type: adventure");
  });

  it("adds a row with a bad phone and an email, keeping the phone in the note", () => {
    const reading = enquiryOf(read(["name", "phone", "email"], ["Asha", "12345", "asha@example.com"]));
    expect(reading.contacts).toEqual({ phone: null, email: "asha@example.com", instagramHandle: null });
    expect(reading.enquiry.note).toBe("Phone: 12345");
    expect(reading.noted).toBe(true);
  });

  it("notes 'Children: 2, ages not given', and a count that disagrees with the ages", () => {
    const fields: (ImportField | null)[] = ["name", "phone", "children_count", "children_ages"];
    expect(enquiryOf(read(fields, ["Asha", "9876543210", "2", null])).enquiry.note).toBe("Children: 2, ages not given");
    const disagree = enquiryOf(read(fields, ["Asha", "9876543210", "3", "7, 4"]));
    expect(disagree.enquiry.trip.childrenAges).toEqual([7, 4]);
    expect(disagree.enquiry.note).toBe("Children: 3, but ages are given for 2");
    expect(enquiryOf(read(fields, ["Asha", "9876543210", "2", "7, 4"])).enquiry.note).toBeNull();
  });

  it("joins the Note columns as 'Remarks: wants a houseboat' lines, and refuses notes over 4,000 characters", () => {
    const fields: (ImportField | null)[] = ["name", "phone", "note", "note"];
    const reading = enquiryOf(read(fields, ["Asha", "9876543210", "wants a houseboat", "second line"]));
    expect(reading.enquiry.note).toBe("Remarks: wants a houseboat\nRemarks: second line");
    expect(reading.noted).toBe(false);
    const long = read(fields, ["Asha", "9876543210", "x".repeat(4000), null]);
    expect(long).toMatchObject({ kind: "not_added", reasons: [{ code: "notes_too_long" }] });
  });

  it("refuses a row with no name, no usable contact, or marked Not a lead", () => {
    expect(read(["name", "phone"], [null, "9876543210"])).toMatchObject({
      kind: "not_added",
      reasons: [{ code: "no_name" }],
    });
    expect(read(["name", "phone", "email"], ["Asha", "12345", null])).toMatchObject({
      kind: "not_added",
      reasons: [{ code: "no_contact" }],
      exampleName: "Asha",
      exampleValue: "12345",
    });
    expect(read(["name", "phone", "stage"], ["Asha", "9876543210", "Junk"])).toMatchObject({
      kind: "not_added",
      reasons: [{ code: "not_a_lead" }],
    });
    expect(read(["name", "phone"], [null, null]).kind === "not_added").toBe(true);
  });

  it("sources a row as Import with the file's name, then their source: 'enquiries-oct-2026.xlsx · Instagram', cut to 120", () => {
    const fields: (ImportField | null)[] = ["name", "phone", "their_source"];
    const { enquiry } = enquiryOf(read(fields, ["Asha", "9876543210", "Instagram"]));
    expect([enquiry.source, enquiry.sourceDetail]).toEqual(["bulk_upload", "enquiries-oct-2026.xlsx · Instagram"]);
    expect(enquiryOf(read(fields, ["Asha", "9876543210", "y".repeat(300)])).enquiry.sourceDetail).toHaveLength(120);
  });

  it("takes an enquiry date not in the future as the added date, at the agency's midnight", () => {
    const fields: (ImportField | null)[] = ["name", "phone", "enquiry_date"];
    expect(enquiryOf(read(fields, ["Asha", "9876543210", "12/10/2026"])).createdAt?.toISOString()).toBe(
      "2026-10-11T18:30:00.000Z",
    );
    // Today in the agency's zone is fine; tomorrow isn't, and goes into the note.
    expect(enquiryOf(read(fields, ["Asha", "9876543210", "19/10/2026"])).createdAt?.toISOString()).toBe(
      "2026-10-18T18:30:00.000Z",
    );
    const future = enquiryOf(read(fields, ["Asha", "9876543210", "20/10/2026"]));
    expect([future.createdAt, future.enquiry.note]).toEqual([null, "Enquiry date: 20/10/2026"]);
    expect(enquiryOf(read(fields, ["Asha", "9876543210", "whenever"])).enquiry.note).toBe("Enquiry date: whenever");
  });

  it("gives empty cells the file's defaults: stage, owner and budget basis", () => {
    const reading = enquiryOf(read(["name", "phone", "stage", "owner"], ["Asha", "9876543210", null, null]));
    expect([reading.stage, reading.ownerUserId]).toEqual(["new", OWNER]);
    const matched = enquiryOf(read(["name", "phone", "stage", "owner"], ["Asha", "9876543210", "Called", "Asha"]));
    expect([matched.stage, matched.ownerUserId]).toEqual(["contacted", ASHA]);
    const unknown = enquiryOf(read(["name", "phone", "stage", "owner"], ["Asha", "9876543210", "hmm", "Nobody"]));
    expect([unknown.stage, unknown.ownerUserId]).toEqual(["new", OWNER]);
  });

  it("treats a dash or n/a as an empty cell", () => {
    const reading = enquiryOf(read(["name", "phone", "email", "budget"], ["Asha", "9876543210", "-", "N/A"]));
    expect(reading.enquiry.note).toBeNull();
    expect(reading.enquiry.trip.budget).toBeNull();
  });

  it("names the destination as the file gave it, and fingerprints the same values for the same row", () => {
    const fields: (ImportField | null)[] = ["name", "phone", "destination"];
    const first = enquiryOf(read(fields, ["Asha", "98765 43210", "Goa"]));
    const again = enquiryOf(read(fields, ["Asha", "+919876543210", "Goa"]));
    expect(first.destinationName).toBe("Goa");
    expect(first.fingerprintValues).toEqual(again.fingerprintValues);
    const other = enquiryOf(read(fields, ["Asha", "98765 43210", "Kerala"]));
    expect(other.fingerprintValues).not.toEqual(first.fingerprintValues);
  });
});

describe("reading a Google Sheet's row (N6)", () => {
  const origin = { detail: "Goa Diwali campaign · Form responses 1", timeZone: "Asia/Kolkata", monthFirstDates: false };
  const fields: (ImportField | null)[] = ["name", "phone", "enquiry_date", "their_source"];

  it("sources it as a Google Sheet, with the sheet's detail then their source", () => {
    const { enquiry } = enquiryOf(read(fields, ["Asha", "9876543210", null, "Instagram"], { origin }));
    expect([enquiry.source, enquiry.sourceDetail]).toEqual([
      "google_sheet",
      "Goa Diwali campaign · Form responses 1 · Instagram",
    ]);
  });

  it("reads the enquiry date with its time in the sheet's zone", () => {
    const reading = enquiryOf(read(fields, ["Asha", "9876543210", "19/10/2026 14:32:10", null], { origin }));
    expect(reading.createdAt?.toISOString()).toBe("2026-10-19T09:02:10.000Z");
    const dateOnly = enquiryOf(read(fields, ["Asha", "9876543210", "12/10/2026", null], { origin }));
    expect(dateOnly.createdAt?.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    const future = enquiryOf(read(fields, ["Asha", "9876543210", "20/10/2026 09:00", null], { origin }));
    expect(future.createdAt).toBeNull();
  });

  it("doesn't trust a month-first sheet's 10/12/2026, keeping it in the note", () => {
    const reading = enquiryOf(
      read(fields, ["Asha", "9876543210", "10/12/2026", null], { origin: { ...origin, monthFirstDates: true } }),
    );
    expect([reading.createdAt, reading.enquiry.note]).toEqual([null, "Enquiry date: 10/12/2026"]);
  });

  it("fingerprints a sheet row and the same row in a file alike", () => {
    const cells = ["Asha", "9876543210", "12/10/2026 14:32", null];
    const fromSheet = enquiryOf(read(fields, cells, { origin }));
    const fromFile = enquiryOf(read(fields, cells));
    expect(fromSheet.fingerprintValues).toEqual(fromFile.fingerprintValues);
  });
});
