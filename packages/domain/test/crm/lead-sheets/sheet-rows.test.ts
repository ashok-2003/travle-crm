// A sheet row read into an enquiry (S21, S22): a Google Form's row, its Timestamp with its time in the sheet's zone, the
// source, a phone as shown, a month-first sheet's ambiguous date, a date alone, several questions in the note, the owner.
import { describe, expect, it } from "vitest";
import { formColumns, formHeader, goaOrigin, readFormRow } from "./support.js";

const answer = [
  "19/10/2026 14:32:10",
  "Asha Sharma",
  "98765 43210",
  "asha@example.test",
  "Goa",
  "Yes",
  "Window seats please",
  "",
  "Instagram",
];

function enquiry(cells: string[], options?: Parameters<typeof readFormRow>[1]) {
  const { reading } = readFormRow(cells, options);
  if (reading.kind !== "enquiry") throw new Error(`Not an enquiry: ${JSON.stringify(reading)}`);
  return reading;
}
const withCell = (index: number, value: string) => answer.map((cell, at) => (at === index ? value : cell));

describe("readSheetRow", () => {
  it("reads a Google Form's row: name, phone, email, destination and a Timestamp with its time as the enquiry moment", () => {
    const reading = enquiry(answer);
    expect(reading.enquiry.person).toEqual({
      name: "Asha Sharma",
      phone: "+919876543210",
      email: "asha@example.test",
    });
    expect(reading.destinationName).toBe("Goa");
    // 14:32:10 in Asia/Kolkata is 09:02:10 UTC.
    expect(reading.createdAt?.toISOString()).toBe("2026-10-19T09:02:10.000Z");
    expect(reading.stage).toBe("new");
    expect(reading.contacts).toEqual({ phone: "+919876543210", email: "asha@example.test", instagramHandle: null });
  });

  it("sources the lead Google Sheet, with 'Goa Diwali campaign · Form responses 1' and their source cell after it, cut to 120", () => {
    const reading = enquiry(answer);
    expect(reading.enquiry.source).toBe("google_sheet");
    expect(reading.enquiry.sourceDetail).toBe("Goa Diwali campaign · Form responses 1 · Instagram");
    const long = enquiry(answer, { origin: { ...goaOrigin, detail: "x".repeat(130) } });
    expect(long.enquiry.sourceDetail).toHaveLength(120);
    expect(enquiry(withCell(8, "")).enquiry.sourceDetail).toBe("Goa Diwali campaign · Form responses 1");
  });

  it("keeps a phone's leading zero as shown and reads it as +919876543210", () => {
    expect(enquiry(withCell(2, "098765 43210")).contacts.phone).toBe("+919876543210");
    expect(enquiry(withCell(2, "+91 98765-43210")).contacts.phone).toBe("+919876543210");
  });

  it("does not trust an ambiguous date from a month-first sheet: the lead is added now, the cell in the note", () => {
    const origin = { ...goaOrigin, monthFirstDates: true };
    const reading = enquiry(withCell(0, "10/12/2026 14:32:10"), { origin });
    expect(reading.createdAt).toBeNull();
    expect(reading.enquiry.note).toContain("Enquiry date: 10/12/2026 14:32:10");
    expect(reading.noted).toBe(true);
  });

  it("still reads an unambiguous date from a month-first sheet", () => {
    const origin = { ...goaOrigin, monthFirstDates: true };
    const reading = enquiry(withCell(0, "10/25/2026 09:30:00"), { origin, today: "2026-11-01" });
    expect(reading.createdAt?.toISOString()).toBe("2026-10-25T04:00:00.000Z");
    expect(reading.noted).toBe(false);
  });

  it("takes a date only as the start of that day in the agency's zone, and a date in the future as now", () => {
    expect(enquiry(withCell(0, "19/10/2026")).createdAt?.toISOString()).toBe("2026-10-18T18:30:00.000Z");
    const future = enquiry(withCell(0, "25/12/2026 10:00"));
    expect(future.createdAt).toBeNull();
    expect(future.enquiry.note).toContain("Enquiry date: 25/12/2026 10:00");
  });

  it("keeps several question columns as 'Do you need visas?: Yes' lines in the note", () => {
    expect(enquiry(answer).enquiry.note).toBe("Do you need visas?: Yes\nAnything else?: Window seats please");
  });

  it("gives the owner column's target, else the agency Owner, and the stage always New", () => {
    expect(enquiry(withCell(7, "Ashu"), { owners: { Ashu: "user-asha" } }).ownerUserId).toBe("user-asha");
    expect(enquiry(withCell(7, "Ashu"), { owners: { Ashu: null } }).ownerUserId).toBe("owner-1");
    expect(enquiry(withCell(7, "Somebody")).ownerUserId).toBe("owner-1");
    expect(enquiry(withCell(7, "")).ownerUserId).toBe("owner-1");
    expect(enquiry(answer).stage).toBe("new");
  });

  it("reads a Sheets error value in a phone cell as no phone, not as a contact", () => {
    // The adapter hands an error value over as an empty cell; a row with a name and no other contact is not a lead.
    const { reading } = readFormRow(["", "Asha", "", "", "Goa", "", "", "", ""]);
    expect(reading).toMatchObject({ kind: "not_added", reasons: [{ code: "no_contact" }] });
    const noName = readFormRow(["", "", "98765 43210", "", "", "", "", "", ""]).reading;
    expect(noName).toMatchObject({ kind: "not_added", reasons: [{ code: "no_name" }] });
  });

  it("lists a row with a name and a contact but notes over 4,000 characters", () => {
    const { reading } = readFormRow(withCell(6, "x".repeat(4_100)));
    expect(reading).toMatchObject({ kind: "not_added" });
    expect(reading.kind === "not_added" ? reading.reasons.map((reason) => reason.code) : []).toContain(
      "notes_too_long",
    );
  });

  it("keeps the header and fields the form was matched with", () => {
    expect(formHeader).toHaveLength(formColumns.length);
  });
});
