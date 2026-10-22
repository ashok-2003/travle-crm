// The text and mode checks of a submission: required fields, fields that are off, links, and the bot check's three answers.
import { describe, expect, it } from "vitest";
import { assertAnswersMatchModes, assertNoLinks, assertNotBot } from "../../src/website-forms/index.js";
import { aFormRow } from "./support.js";

const base = { name: "Asha Rao", phone: "+919876543210" };
const reasonOf = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return (error as { code?: string; reason?: string }).reason;
  }
  return "accepted";
};

describe("assertAnswersMatchModes", () => {
  it("a required field missing is VALIDATION", () => {
    const required = {
      emailMode: { ...base, adults: 2 },
      destinationMode: base,
      travelMonthMode: base,
      travellersMode: base,
      budgetMode: base,
      messageMode: base,
    } as const;
    for (const [mode, answers] of Object.entries(required)) {
      expect(
        reasonOf(() => assertAnswersMatchModes(aFormRow({ [mode]: "required" }), answers)),
        mode,
      ).toBe("FORM_ANSWER_REQUIRED");
    }
  });

  it("an empty message, or Not sure yet, does not satisfy a required field", () => {
    expect(
      reasonOf(() => assertAnswersMatchModes(aFormRow({ messageMode: "required" }), { ...base, message: "   " })),
    ).toBe("FORM_ANSWER_REQUIRED");
    expect(
      reasonOf(() =>
        assertAnswersMatchModes(aFormRow({ travelMonthMode: "required" }), { ...base, travelMonth: null }),
      ),
    ).toBe("FORM_ANSWER_REQUIRED");
    expect(
      reasonOf(() =>
        assertAnswersMatchModes(aFormRow({ travelMonthMode: "required" }), { ...base, travelMonth: "flexible" }),
      ),
    ).toBe("accepted");
  });

  it("an off field present is dropped, and the rest are kept", () => {
    const kept = assertAnswersMatchModes(aFormRow({ budgetMode: "off", emailMode: "off" }), {
      ...base,
      email: "asha@example.test",
      budget: { rupees: 50_000, basis: "everyone" },
      adults: 2,
      childrenAges: [4],
      message: "  Goa in December  ",
      destination: { kind: "typed", text: "Spiti" },
      travelMonth: "2026-12",
    });
    expect(kept).toEqual({
      ...base,
      adults: 2,
      childrenAges: [4],
      message: "Goa in December",
      destination: { kind: "typed", text: "Spiti" },
      travelMonth: "2026-12",
    });
  });

  it("drops the tickbox answer when the form has no tickbox", () => {
    expect(assertAnswersMatchModes(aFormRow({ offersTickbox: false }), { ...base, offers: true })).not.toHaveProperty(
      "offers",
    );
    expect(assertAnswersMatchModes(aFormRow({ offersTickbox: true }), { ...base, offers: true })).toHaveProperty(
      "offers",
      true,
    );
  });

  it("drops travellers entirely when that field is off", () => {
    const kept = assertAnswersMatchModes(aFormRow({ travellersMode: "off" }), {
      ...base,
      adults: 3,
      childrenAges: [2],
    });
    expect(kept).not.toHaveProperty("adults");
    expect(kept).not.toHaveProperty("childrenAges");
  });
});

describe("assertNoLinks", () => {
  const link = "see https://example.test/a";
  it("three links are refused, two are allowed", () => {
    expect(
      reasonOf(() => {
        assertNoLinks({ ...base, message: `${link} www.one.test https://two.test` });
      }),
    ).toBe("FORM_LINKS_NOT_ALLOWED");
    expect(
      reasonOf(() => {
        assertNoLinks({ ...base, message: `${link} and www.one.test` });
      }),
    ).toBe("accepted");
  });

  it("an HTML tag is refused", () => {
    for (const message of ["<b>hello</b>", "x <script>alert(1)</script>", "<a href='x'>y</a>", "<!-- hi -->"]) {
      expect(
        reasonOf(() => {
          assertNoLinks({ ...base, message });
        }),
        message,
      ).toBe("FORM_LINKS_NOT_ALLOWED");
    }
    expect(
      reasonOf(() => {
        assertNoLinks({ ...base, message: "2 < 3 and 5 > 4" });
      }),
    ).toBe("accepted");
  });

  it("a web address in the name or a typed destination is refused", () => {
    expect(
      reasonOf(() => {
        assertNoLinks({ ...base, name: "win.example.com" });
      }),
    ).toBe("FORM_LINKS_NOT_ALLOWED");
    expect(
      reasonOf(() => {
        assertNoLinks({ ...base, destination: { kind: "typed", text: "www.spam.test" } });
      }),
    ).toBe("FORM_LINKS_NOT_ALLOWED");
  });
});

describe("assertNotBot", () => {
  it("unreachable Turnstile passes, a pass passes and a fail is refused", () => {
    expect(
      reasonOf(() => {
        assertNotBot("unreachable");
      }),
    ).toBe("accepted");
    expect(
      reasonOf(() => {
        assertNotBot("pass");
      }),
    ).toBe("accepted");
    expect(
      reasonOf(() => {
        assertNotBot("fail");
      }),
    ).toBe("FORM_BOT_CHECK_FAILED");
  });
});
