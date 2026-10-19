// Guessing what each column holds (spec B9, B10, D13, D14): the agency's last match of a column of the same name, then
// the common names, each field's own label and our exports' headers; never our report's two columns; one column a
// field, Note excepted.
import { leadExportHeaders } from "@travel-crm/contracts/crm";
import { staffExportHeaders } from "@travel-crm/contracts/identity";
import type { ImportField } from "@travel-crm/contracts/imports";
import { describe, expect, it } from "vitest";
import { guessFields, headerKey } from "../../src/imports/index.js";

const none = new Map<string, ImportField | null>();
const fieldsOf = (guesses: { field: ImportField | null }[]) => guesses.map((guess) => guess.field);

describe("guessing a file's columns", () => {
  it("keys a header in lower case, without spaces, punctuation or symbols", () => {
    expect(headerKey("  Mobile No. ")).toBe("mobileno");
    expect(headerKey("E-mail ID")).toBe("emailid");
    expect(headerKey("Children's ages")).toBe("childrensages");
    expect(headerKey("Budget (₹)")).toBe("budget");
  });

  it("guesses Mobile No as Phone, Assigned To as Owner, Lead Status as Stage and Remarks as Note", () => {
    const headers = [
      "Customer Name",
      "Mobile No",
      "Email ID",
      "Assigned To",
      "Lead Status",
      "Remarks",
      "Requirement",
      "Pax",
    ];
    const guesses = guessFields("leads", headers, none);
    expect(fieldsOf(guesses)).toEqual(["name", "phone", "email", "owner", "stage", "note", "note", "adults"]);
    expect(guesses.every((guess) => guess.guessedBy === "common-name")).toBe(true);
    // A field goes to its first column only, Note excepted.
    expect(fieldsOf(guessFields("leads", ["Phone", "Mobile", "WhatsApp"], none))).toEqual(["phone", null, null]);
    expect(guessFields("leads", ["Favourite colour"], none)).toEqual([{ field: null, guessedBy: null }]);
  });

  it("guesses a header the agency matched last time 'As last time', before the common names", () => {
    const remembered = new Map<string, ImportField | null>([
      ["contact", "email"],
      ["notes", null],
      ["mobile", "phone"],
    ]);
    expect(guessFields("leads", ["Contact", "Notes", "Phone", "Mobile"], remembered)).toEqual([
      { field: "email", guessedBy: "last-time" },
      { field: null, guessedBy: "last-time" },
      { field: "phone", guessedBy: "common-name" },
      // Phone is taken by the column before it, whatever the agency did last time.
      { field: null, guessedBy: null },
    ]);
  });

  it("never guesses our report's 'Why it wasn't added' and 'Row', and guesses an export's own headers back", () => {
    const remembered = new Map<string, ImportField | null>([["row", "adults"]]);
    expect(fieldsOf(guessFields("leads", ["Why it wasn't added", "Row", "Name"], remembered))).toEqual([
      null,
      null,
      "name",
    ]);
    const exported = fieldsOf(guessFields("leads", [...leadExportHeaders], none));
    expect(Object.fromEntries(leadExportHeaders.map((header, index) => [header, exported[index]]))).toEqual({
      Name: "name",
      Phone: "phone",
      Email: "email",
      Instagram: "instagram",
      Returning: null,
      Stage: "stage",
      Destination: "destination",
      "Travel from": "travel_from",
      "Travel to": "travel_to",
      "Travel month": "travel_month",
      Adults: "adults",
      "Children's ages": "children_ages",
      Budget: "budget",
      "Budget basis": "budget_basis",
      "Departure city": "departure_city",
      "Trip type": "trip_type",
      "Hotel category": "hotel_category",
      Food: "food",
      "Room type": "room_type",
      Owner: "owner",
      Source: "their_source",
      "Source detail": null,
      "Added on": "enquiry_date",
      "Next follow-up": null,
      "Next follow-up note": null,
      "Lead link": null,
    });
  });

  it("guesses a staff file's Name, Username, Email, Phone and Role, and its export's columns back", () => {
    expect(fieldsOf(guessFields("staff", ["Employee Name", "Login", "E-mail", "Mobile", "Designation"], none))).toEqual(
      ["name", "username", "email", "phone", "role"],
    );
    expect(fieldsOf(guessFields("staff", [...staffExportHeaders], none))).toEqual([
      "name",
      "username",
      "email",
      "phone",
      "role",
      null,
      null,
      null,
    ]);
    // A lead field isn't a staff file's.
    expect(fieldsOf(guessFields("staff", ["Budget", "Destination"], none))).toEqual([null, null]);
  });
});
