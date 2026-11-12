// The Understand form's checks and merge: a detail survives only on the customer's own words, and a change clears what it outdates.
import { liteFacts, understandForm, type UnderstandForm } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { checkedForm } from "../../../src/ai/lite/form-check.js";
import { mergeForm } from "../../../src/ai/lite/merge.js";
import type { ContextMessage, PackageIndexEntry } from "../../../src/ai/lite/types.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const P1 = "01900000-0000-7000-8000-000000000001";
const P2 = "01900000-0000-7000-8000-000000000002";
const D1 = "01900000-0000-7000-8000-0000000000d1";
const today = parseCalendarDate("2026-10-23");
const index: PackageIndexEntry[] = [
  { id: P1, title: "Kedarnath Yatra 4N", place: "Kedarnath", destinationId: null, nights: 4, startCity: "Delhi" },
];
const line = (id: string, from: ContextMessage["from"], text: string): ContextMessage => ({
  id,
  from,
  at: new Date("2026-10-23T08:00:00Z"),
  kind: "text",
  text,
});
const emptyForm: UnderstandForm = {
  intents: [{ name: "gives_details", proof: "" }],
  details: {
    package: null,
    place: null,
    date: null,
    adults: null,
    children: null,
    name: null,
    pickup_city: null,
    room: null,
    pay_in_full: null,
  },
  open_to_other_trips: "unknown",
  lookups: [],
  language: "english",
  summary: "",
  score: {
    chance: 50,
    label: "warm",
    reasons: [],
    looks_fake: false,
    fake_why: "",
    standing: "",
    next_step: "",
  },
};
const formWith = (details: Partial<UnderstandForm["details"]>, rest: Partial<UnderstandForm> = {}): UnderstandForm => ({
  ...emptyForm,
  ...rest,
  details: { ...emptyForm.details, ...details },
});
const check = (
  form: UnderstandForm,
  messages: ContextMessage[],
  burst = messages.filter((m) => m.from === "customer"),
) => checkedForm(form, messages, burst, index, today);

describe("checkedForm", () => {
  it("a detail without its words is dropped", () => {
    const messages = [line("1", "customer", "hello there")];
    const checked = check(formWith({ adults: { count: 3, proof: "we are three people", changed: false } }), messages);
    expect(checked.form.details.adults).toBeNull();
    expect(checked.dropped).toContain("adults");
  });

  it("keeps a detail that the customer's words say, with its proof and message", () => {
    const messages = [line("1", "customer", "we are 3 adults")];
    const checked = check(formWith({ adults: { count: 3, proof: "we are 3", changed: false } }), messages);
    expect(checked.form.details.adults?.count).toBe(3);
    expect(checked.proofs.adults).toEqual({ excerpt: "we are 3", messageIds: ["1"] });
  });

  it("a count the words don't say is dropped", () => {
    const messages = [line("1", "customer", "we are 3")];
    const checked = check(formWith({ adults: { count: 4, proof: "we are 3", changed: false } }), messages);
    expect(checked.dropped).toContain("adults");
  });

  it("a past day is dropped", () => {
    const messages = [line("1", "customer", "1 oct")];
    const checked = check(
      formWith({ date: { day: parseCalendarDate("2026-10-01"), month: null, proof: "1 oct", changed: false } }),
      messages,
    );
    expect(checked.form.details.date).toBeNull();
    expect(checked.dropped).toContain("date");
  });

  it("our own line is never proof", () => {
    const messages = [line("1", "customer", "hi"), line("2", "you", "How many adults are travelling?")];
    const checked = check(
      formWith({ adults: { count: 2, proof: "How many adults are travelling", changed: false } }),
      messages,
    );
    expect(checked.dropped).toContain("adults");
  });

  it("a booking wish needs the newest words", () => {
    const messages = [
      line("1", "customer", "I want to book"),
      line("2", "you", "Which date?"),
      line("3", "customer", "15 dec"),
    ];
    const checked = check(formWith({}, { intents: [{ name: "wants_to_book", proof: "I want to book" }] }), messages, [
      messages.slice(2)[0] ?? line("0", "customer", ""),
    ]);
    expect(checked.form.intents).toEqual([{ name: "other", proof: "" }]);
  });

  it("a booking wish stays when the newest words say it", () => {
    const messages = [line("1", "customer", "yes I want to book")];
    const checked = check(formWith({}, { intents: [{ name: "wants_to_book", proof: "I want to book" }] }), messages);
    expect(checked.form.intents[0]?.name).toBe("wants_to_book");
  });

  it("a near-spelt package is no package", () => {
    const messages = [line("1", "customer", "kedarkantha trek please")];
    const checked = check(
      formWith({ package: { name: "Kedarkantha Trek", proof: "kedarkantha trek", changed: false } }),
      messages,
    );
    expect(checked.form.details.package).toBeNull();
    expect(checked.dropped).toContain("package");
  });

  it("a near-spelling of a place we run is no package, even under a title we have", () => {
    const trek: PackageIndexEntry = { ...index[0], title: "Kedarnath Trek" } as PackageIndexEntry;
    const messages = [line("1", "customer", "kedarkantha trek please")];
    const checked = checkedForm(
      formWith({ package: { name: "Kedarnath Trek", proof: "kedarkantha trek", changed: false } }),
      messages,
      messages,
      [trek],
      today,
    );
    expect(checked.form.details.package).toBeNull();
    const named = [line("2", "customer", "the kedarnath one")];
    const kept = checkedForm(
      formWith({ package: { name: "Kedarnath Trek", proof: "the kedarnath one", changed: false } }),
      named,
      named,
      [trek],
      today,
    );
    expect(kept.form.details.package).not.toBeNull();
  });

  it("a proof sharing only 'trek' with two trek titles names neither", () => {
    const treks: PackageIndexEntry[] = [
      { ...index[0], id: P1, title: "Kedarnath Trek", place: null } as PackageIndexEntry,
      { ...index[0], id: P2, title: "Brahmatal Trek", place: null } as PackageIndexEntry,
    ];
    const messages = [line("1", "customer", "a trek please")];
    const checked = checkedForm(
      formWith({ package: { name: "Brahmatal Trek", proof: "a trek please", changed: false } }),
      messages,
      messages,
      treks,
      today,
    );
    expect(checked.form.details.package).toBeNull();
  });

  it("our last message names a trip only when the customer's words name none", () => {
    const trek: PackageIndexEntry = { ...index[0], title: "Kedarnath Trek" } as PackageIndexEntry;
    const run = (text: string) => {
      const messages = [line("1", "you", "Shall I tell you about Kedarnath Trek?"), line("2", "customer", text)];
      return checkedForm(
        formWith({ package: { name: "Kedarnath Trek", proof: text, changed: false } }),
        messages,
        messages,
        [trek],
        today,
      ).form.details.package;
    };
    expect(run("kedarkantha trek")).toBeNull();
    expect(run("yes that one")).not.toBeNull();
    expect(run("haan pehla wala")).not.toBeNull();
  });

  it("a word two packages share names neither", () => {
    const pair: PackageIndexEntry[] = [
      { ...index[0], id: P1, title: "Himalayan Kedarnath", place: null } as PackageIndexEntry,
      { ...index[0], id: P2, title: "Himalayan Spiti", place: null } as PackageIndexEntry,
    ];
    const messages = [line("1", "customer", "the himalayan one")];
    const checked = checkedForm(
      formWith({ package: { name: "Himalayan Spiti", proof: "the himalayan one", changed: false } }),
      messages,
      messages,
      pair,
      today,
    );
    expect(checked.form.details.package).toBeNull();
  });

  it("our own line in the burst never backs an intent", () => {
    const messages = [line("1", "customer", "hi"), line("2", "you", "shall I book it for you")];
    const checked = check(
      formWith({}, { intents: [{ name: "wants_to_book", proof: "shall I book it" }] }),
      messages,
      messages,
    );
    expect(checked.form.intents).toEqual([{ name: "other", proof: "" }]);
  });

  it("a package by its exact title stays when the proof shares a word with it", () => {
    const messages = [line("1", "customer", "the kedarnath one")];
    const checked = check(
      formWith({ package: { name: "kedarnath yatra 4n", proof: "kedarnath", changed: false } }),
      messages,
    );
    expect(checked.form.details.package?.name).toBe("kedarnath yatra 4n");
    expect(checked.proofs.destination?.messageIds).toEqual(["1"]);
  });

  it("a package confirmed by yes stays when our last lines named it", () => {
    const messages = [
      line("1", "you", "Shall I tell you about Kedarnath Yatra 4N?"),
      line("2", "customer", "yes please"),
    ];
    const checked = check(
      formWith({ package: { name: "Kedarnath Yatra 4N", proof: "yes please", changed: false } }),
      messages,
    );
    expect(checked.form.details.package).not.toBeNull();
  });

  it("the summary loses amounts and dates", () => {
    const checked = check(emptyForm, [], []);
    const summarised = check({ ...emptyForm, summary: "budget ₹15,000, going 15 Dec" }, []);
    expect(checked.form.summary).toBe("");
    expect(summarised.form.summary).not.toContain("₹15,000");
    expect(summarised.form.summary).not.toContain("15 Dec");
  });

  it("keeps children's ages only when each is said", () => {
    const messages = [line("1", "customer", "2 kids aged 8 and 5")];
    const kept = check(
      formWith({ children: { count: 2, ages: [8, 5], proof: "2 kids aged 8 and 5", changed: false } }),
      messages,
    );
    expect(kept.form.details.children?.ages).toEqual([8, 5]);
    const cut = check(
      formWith({ children: { count: 2, ages: [8, 9], proof: "2 kids aged 8 and 5", changed: false } }),
      messages,
    );
    expect(cut.form.details.children).toMatchObject({ count: 2, ages: [] });
  });

  it("knows a room by an alias", () => {
    const messages = [line("1", "customer", "2 sharing is fine")];
    const checked = check(formWith({ room: { type: "double", proof: "2 sharing", changed: false } }), messages);
    expect(checked.form.details.room?.type).toBe("double");
    const wrong = check(formWith({ room: { type: "triple", proof: "2 sharing", changed: false } }), messages);
    expect(wrong.dropped).toContain("room");
  });
});

describe("mergeForm", () => {
  const base = liteFacts.parse({
    agent: "lite",
    packageId: P1,
    day: "2026-12-01",
    month: "2026-12",
    departureId: D1,
    adults: 2,
    quoted: { departureId: D1, totalPaise: 100, advancePaise: 10 },
  });
  const merged = (details: Partial<UnderstandForm["details"]>, facts = base) =>
    mergeForm(facts, { form: formWith(details), proofs: {}, dropped: [] }, index);

  it("a new date replaces the old and clears the departure and the quote", () => {
    const facts = merged({
      date: { day: parseCalendarDate("2026-12-15"), month: null, proof: "15 dec", changed: true },
    });
    expect(facts.day).toBe("2026-12-15");
    expect(facts.departureId).toBeNull();
    expect(facts.quoted).toBeNull();
  });

  it("keeps a fact the customer didn't change", () => {
    const facts = merged({ adults: { count: 5, proof: "5", changed: false } });
    expect(facts.adults).toBe(2);
    expect(facts.quoted).not.toBeNull();
  });

  it("a changed count replaces it and clears the quote", () => {
    const facts = merged({ adults: { count: 5, proof: "5", changed: true } });
    expect(facts.adults).toBe(5);
    expect(facts.quoted).toBeNull();
    expect(facts.departureId).toBe(D1);
  });

  it("a package change clears the departure and the quote", () => {
    const other = [...index, { ...index[0], id: P2, title: "Badrinath 3N" } as PackageIndexEntry];
    const facts = mergeForm(
      base,
      { form: formWith({ package: { name: "badrinath 3n", proof: "x", changed: false } }), proofs: {}, dropped: [] },
      other,
    );
    expect(facts.packageId).toBe(P2);
    expect(facts.departureId).toBeNull();
    expect(facts.quoted).toBeNull();
  });

  it("a place with exactly one match picks the package, else is kept as words", () => {
    const empty = liteFacts.parse({ agent: "lite" });
    const one = merged({ place: { words: "Kedarnath", proof: "x", changed: false } }, empty);
    expect(one.packageId).toBe(P1);
    const none = merged({ place: { words: "Goa", proof: "x", changed: false } }, empty);
    expect(none.packageId).toBeNull();
    expect(none.placeWords).toBe("Goa");
  });

  it("the language always follows the form", () => {
    const facts = mergeForm(base, { form: { ...emptyForm, language: "hindi" }, proofs: {}, dropped: [] }, index);
    expect(facts.language).toBe("hindi");
  });

  it("understandForm accepts the empty form used here", () => {
    expect(understandForm.safeParse(emptyForm).success).toBe(true);
  });
});
