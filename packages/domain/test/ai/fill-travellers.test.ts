// Travellers read by the AI, the parts that are plain code: a passport's machine-readable lines and their check digits, full
// dates only, an age never a birthday, the row each person fills, room words, and what an ID may give (a passport in full when
// its lines check out; any other ID only a name, a birth date and a gender, never a number).
import { describe, expect, it } from "vitest";
import { resolveBirthDate, resolveFullDate } from "../../src/ai/fill/full-date.js";
import { checkDigitOf, readMrz } from "../../src/ai/fill/mrz.js";
import { matchRows } from "../../src/ai/fill/travellers-match.js";
import { travellersAnswer } from "@travel-crm/contracts/ai";
import { resolveTravellers, roomRequestOf } from "../../src/ai/fill/travellers-resolve.js";

const TODAY = "2026-11-02";
// ICAO 9303's own specimen passport.
const LINE1 = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
const LINE2 = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";

/** A passport's second line for a number, birth and expiry, with every check digit worked out. */
function line2(number: string, birth: string, expiry: string, sex = "M"): string {
  const padded = number.padEnd(9, "<");
  const personal = "<".repeat(14);
  const head = `${padded}${String(checkDigitOf(padded))}IND${birth}${String(checkDigitOf(birth))}${sex}${expiry}${String(checkDigitOf(expiry))}${personal}0`;
  const composite = head.slice(0, 10) + head.slice(13, 20) + head.slice(21, 43);
  return `${head}${String(checkDigitOf(composite))}`;
}
const INDIAN1 = "P<INDSHARMA<<RAHUL".padEnd(44, "<");

describe("a passport's machine-readable lines", () => {
  it("reads the ICAO specimen, with every check digit holding", () => {
    expect(readMrz(LINE1, LINE2, TODAY)).toEqual({
      surname: "ERIKSSON",
      givenNames: "ANNA MARIA",
      number: "L898902C3",
      nationality: "UTO",
      dateOfBirth: "1974-08-12",
      sex: "female",
      expiresOn: "2012-04-15",
    });
  });

  it("refuses a line with one digit wrong, in any field", () => {
    // (The country code, at 10 to 12, is covered by no check digit in the standard.)
    for (const index of [0, 5, 9, 14, 19, 22, 27, 33, 42, 43]) {
      const changed = LINE2.slice(0, index) + (LINE2[index] === "7" ? "8" : "7") + LINE2.slice(index + 1);
      expect(readMrz(LINE1, changed, TODAY)).toBeNull();
    }
  });

  it("refuses a blanked, short or wrong-kind copy", () => {
    expect(readMrz(LINE1, "", TODAY)).toBeNull();
    expect(readMrz(LINE1, LINE2.slice(0, 40), TODAY)).toBeNull();
    expect(readMrz("V<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", LINE2, TODAY)).toBeNull();
    expect(readMrz(LINE1, "<".repeat(44), TODAY)).toBeNull();
  });

  it("chooses the century of a birth year that is not in the future", () => {
    const born = readMrz(INDIAN1, line2("Z1234567", "100315", "350101"), TODAY);
    expect(born).toMatchObject({ dateOfBirth: "2010-03-15", expiresOn: "2035-01-01", number: "Z1234567" });
    const old = readMrz(INDIAN1, line2("Z1234567", "560315", "350101"), TODAY);
    expect(old?.dateOfBirth).toBe("1956-03-15");
  });
});

describe("full dates only", () => {
  it.each([
    ["15/03/1980", "1980-03-15"],
    ["15-3-1980", "1980-03-15"],
    ["15 March 1980", "1980-03-15"],
    ["March 15, 1980", "1980-03-15"],
    ["15th Mar 1980", "1980-03-15"],
    ["1980-03-15", "1980-03-15"],
  ])("%s is %s", (said, day) => {
    expect(resolveFullDate(said)).toBe(day);
  });

  it.each(["12 years old", "March 1980", "15/03", "1980", "30 February 1980", "tomorrow", ""])(
    "%s is not a date",
    (said) => {
      expect(resolveFullDate(said)).toBeNull();
    },
  );

  it("a birth date is not in the future and not 120 years back", () => {
    expect(resolveBirthDate("15/03/2030", TODAY)).toBeNull();
    expect(resolveBirthDate("15/03/1890", TODAY)).toBeNull();
    expect(resolveBirthDate("15/03/2014", TODAY)).toBe("2014-03-15");
  });
});

describe("which row a person fills", () => {
  const rows = [
    { id: "r1", name: "" },
    { id: "r2", name: "Sunita Sharma" },
    { id: "r3", name: "" },
  ];
  it("finds a row holding the same name, even spelt a little differently, before taking an empty one", () => {
    expect(matchRows(["Ramesh", "Sunitha Sharma"], rows)).toEqual(["r1", "r2"]);
  });
  it("takes the next empty rows in order, and gives none when the rows run out", () => {
    expect(matchRows(["Ramesh", "Aarav", "Meera"], rows)).toEqual(["r1", "r3", null]);
  });
  it("uses a row once", () => {
    expect(matchRows(["Sunita Sharma", "Sunita Sharma"], rows)).toEqual(["r2", "r1"]);
  });
});

describe("room words", () => {
  it.each([
    ["needs a ground floor room", "ground_floor"],
    ["bad knee", "ground_floor"],
    ["wants her own room", "single_room"],
    ["near the group please", "near_group"],
    ["quiet room", "none"],
  ] as const)("%s is %s", (words, request) => {
    expect(roomRequestOf(words)).toBe(request);
  });
});

const T1 = "9ca9d4e6-4be3-4d39-adf3-b5e2d9b68afa";
const T2 = "3f63f3a4-be32-41e1-9885-ec80570c763a";
const T3 = "e95d7148-83fe-4507-a34e-f10a5a0e854f";
const rows = [
  { id: T1, name: "" },
  { id: T2, name: "" },
  { id: T3, name: "" },
];
const context = { today: TODAY, rows, mayReadIds: true, from: "voice" as const };
const people = (...list: Record<string, unknown>[]) => travellersAnswer.parse({ people: list });

describe("travellers from a voice note or a list", () => {
  it("fills the rows in order, keeps an age as an age, and maps the room words", () => {
    const resolved = resolveTravellers(
      people(
        { name: "Ramesh Sharma", dateOfBirth: "12 June 1980", gender: "male" },
        { name: "Sunita", gender: "wife", roomRequest: "ground floor", roomNote: "ground floor room" },
        { name: "Aarav", age: 12 },
      ),
      context,
    );
    expect(resolved.fields).toHaveLength(1);
    expect(resolved.fields[0]?.value).toEqual([
      { saidName: "Ramesh Sharma", travellerId: T1, name: "Ramesh Sharma", dateOfBirth: "1980-06-12", gender: "male" },
      {
        saidName: "Sunita",
        travellerId: T2,
        name: "Sunita",
        gender: "female",
        roomRequest: "ground_floor",
        roomNote: "ground floor room",
      },
      { saidName: "Aarav", travellerId: T3, name: "Aarav", ageOnly: 12 },
    ]);
  });

  it("never turns an age into a date of birth, and asks when a part of a date was said", () => {
    const resolved = resolveTravellers(people({ name: "Aarav", age: 12, dateOfBirth: "12 years" }), context);
    const [aarav] = resolved.fields[0]?.value as Record<string, unknown>[];
    expect(aarav).not.toHaveProperty("dateOfBirth");
    expect(aarav).toHaveProperty("ageOnly", 12);
    const partial = resolveTravellers(people({ name: "Meera", dateOfBirth: "March 1980" }), context);
    expect(partial.questions.join()).toContain("Meera");
    expect(partial.fields[0]?.value).toEqual([{ saidName: "Meera", travellerId: T1, name: "Meera" }]);
  });

  it("asks, and never adds a row, when more people are named than there are rows", () => {
    const resolved = resolveTravellers(people({ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }), context);
    const value = resolved.fields[0]?.value as { travellerId: string | null }[];
    expect(value.map((one) => one.travellerId)).toEqual([T1, T2, T3, null]);
    expect(resolved.questions).toContain("There are 3 rows; 4 people were named");
  });

  it("drops a phone that is not one and keeps a good one in E.164", () => {
    const resolved = resolveTravellers(people({ name: "A", phone: "98765 43210", emergencyPhone: "12" }), context);
    expect(resolved.fields[0]?.value).toEqual([{ saidName: "A", travellerId: T1, name: "A", phone: "+919876543210" }]);
    expect(resolved.questions.join()).toContain("emergency number");
  });

  it("proposes nothing when nobody was read", () => {
    expect(resolveTravellers(people(), context).fields).toEqual([]);
  });
});

describe("travellers from an ID photo", () => {
  const passport = (overrides: Record<string, unknown> = {}) => ({
    name: "Rahul Sharma",
    idKind: "passport",
    mrzLine1: INDIAN1,
    mrzLine2: line2("Z1234567", "800612", "350101"),
    issueDate: "02/01/2025",
    dateOfBirth: "01/01/1970",
    ...overrides,
  });

  it("takes a passport's number, birth, expiry and nationality from lines that check out, not from the page", () => {
    const resolved = resolveTravellers(people(passport()), context);
    expect(resolved.fields[0]?.value).toEqual([
      {
        saidName: "Rahul Sharma",
        travellerId: T1,
        name: "Rahul Sharma",
        dateOfBirth: "1980-06-12",
        gender: "male",
        identity: {
          kind: "passport",
          number: "Z1234567",
          issuedOn: "2025-01-02",
          expiresOn: "2035-01-01",
          nationality: "IND",
        },
      },
    ]);
  });

  it("leaves the number, birth, expiry and nationality empty when a digit fails, and asks for the number", () => {
    const wrong = line2("Z1234567", "800612", "350101").replace("Z1234567", "Z1234568");
    const resolved = resolveTravellers(people(passport({ mrzLine2: wrong })), context);
    const [one] = resolved.fields[0]?.value as Record<string, unknown>[];
    expect(one).toMatchObject({ name: "Rahul Sharma", idNumberUnreadable: true });
    expect(one).not.toHaveProperty("identity");
    expect(one).not.toHaveProperty("dateOfBirth");
    expect(resolved.questions).toContain("Couldn't read Rahul Sharma's passport number: type it");
  });

  it("gives only a name, a birth date and a gender from any other ID, never a number", () => {
    const resolved = resolveTravellers(
      people({
        name: "Sunita Sharma",
        idKind: "aadhaar",
        dateOfBirth: "05/05/1985",
        gender: "female",
        mrzLine1: INDIAN1,
        mrzLine2: line2("Z1234567", "800612", "350101"),
      }),
      context,
    );
    const [one] = resolved.fields[0]?.value as Record<string, unknown>[];
    expect(one).toEqual({
      saidName: "Sunita Sharma",
      travellerId: T1,
      name: "Sunita Sharma",
      dateOfBirth: "1985-05-05",
      gender: "female",
    });
    expect(JSON.stringify(resolved)).not.toContain("Z1234567");
  });

  it("keeps nothing of an ID for a member who may not read them", () => {
    const resolved = resolveTravellers(people(passport()), { ...context, mayReadIds: false });
    const [one] = resolved.fields[0]?.value as Record<string, unknown>[];
    expect(one).not.toHaveProperty("identity");
    expect(JSON.stringify(resolved)).not.toContain("Z1234567");
  });
});
