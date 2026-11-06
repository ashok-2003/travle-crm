// Reading a chat: a fact counts only with the customer's own words behind it, and code alone merges facts into the record.
import { describe, expect, it } from "vitest";
import { chatFacts, type ReadAnswer } from "@travel-crm/contracts/ai";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { mergeFacts } from "../../../src/ai/grounded/merge-facts.js";
import { checkedRead } from "../../../src/ai/grounded/read-check.js";
import { readChat, type ChatLine } from "../../../src/ai/grounded/read.js";

const today = parseCalendarDate("2026-11-06");
const keys = {
  today,
  destinations: [
    { key: "D1", id: "dest-manali", name: "Manali" },
    { key: "D2", id: "dest-spiti", name: "Spiti" },
  ],
  packages: [
    { key: "S1", id: "pkg-manali", title: "Manali 5N6D", destination: "Manali", destinationId: "dest-manali" },
    { key: "S2", id: "pkg-spiti", title: "Spiti 7N8D", destination: "Spiti", destinationId: "dest-spiti" },
  ],
};
const empty: ReadAnswer = {
  places: [],
  startsOn: null,
  rooms: [],
  travellers: null,
  budgetRupees: null,
  pickupCity: null,
  chosen: null,
  wants: "information",
  wantsEvidence: "",
  special: null,
  nearest: [],
};
const read = (part: Partial<ReadAnswer>): ReadAnswer => ({ ...empty, ...part });
const transcript: ChatLine[] = [
  { from: "customer", text: "Hi, 2 people double sharing for Spiti in December. Also Meghalaya?" },
  { from: "agency", text: "We run Manali and Spiti, and a Goa trip from Mumbai" },
];
const lines = (...texts: string[]): ChatLine[] => texts.map((text) => ({ from: "customer", text }));

describe("checkedRead", () => {
  it("drops evidence the customer didn't write, the agency's own words included", () => {
    const answer = read({
      places: [
        { destination: "none", words: "Goa", evidence: "a Goa trip from Mumbai" },
        { destination: "D2", words: "Spiti", evidence: "  Spiti, in DECEMBER " },
      ],
      pickupCity: { words: "Mumbai", evidence: "from Mumbai" },
    });
    const checked = checkedRead(answer, transcript, keys);
    expect(checked.places).toEqual([{ destination: "D2", words: "Spiti", evidence: "  Spiti, in DECEMBER " }]);
    expect(checked.pickupCity).toBeNull();
  });

  it("requires the evidence to sit inside one message, not across two", () => {
    const answer = read({ travellers: { count: 4, evidence: "december we are 4" } });
    expect(checkedRead(answer, lines("Spiti in December", "we are 4"), keys).travellers).toBeNull();
  });

  it("keeps Devanagari evidence", () => {
    const answer = read({ pickupCity: { words: "दिल्ली", evidence: "दिल्ली से" } });
    expect(checkedRead(answer, lines("हम दिल्ली से, आएंगे।"), keys).pickupCity).not.toBeNull();
  });

  it("drops unknown keys and a past date, and keeps only real nearest keys", () => {
    const answer = read({
      places: [{ destination: "D9", words: "Spiti", evidence: "Spiti" }],
      chosen: { package: "S9", evidence: "Spiti" },
      startsOn: { date: parseCalendarDate("2026-11-01"), month: "2026-10", evidence: "1 Nov" },
      nearest: ["S2", "S7", "P1", "S2"],
    });
    const checked = checkedRead(answer, lines("Spiti on 1 Nov"), keys);
    expect(checked.places).toEqual([]);
    expect(checked.chosen).toBeNull();
    expect(checked.startsOn).toBeNull();
    expect(checked.nearest).toEqual(["S2"]);
  });

  it("keeps a future date and this month, and drops a month before this one alone", () => {
    const thisMonth = read({ startsOn: { date: null, month: "2026-11", evidence: "this november" } });
    expect(checkedRead(thisMonth, lines("this November"), keys).startsOn).toEqual(thisMonth.startsOn);
    const past = read({ startsOn: { date: null, month: "2026-10", evidence: "october" } });
    expect(checkedRead(past, lines("October"), keys).startsOn).toBeNull();
  });

  it("drops a month that is not YYYY-MM", () => {
    const answer = read({ startsOn: { date: null, month: "abc", evidence: "december" } });
    expect(checkedRead(answer, lines("december"), keys).startsOn).toBeNull();
  });

  it("drops a date whose evidence holds no digit, but keeps the month beside it", () => {
    const answer = read({
      startsOn: { date: parseCalendarDate("2026-12-14"), month: "2026-12", evidence: "in december" },
    });
    expect(checkedRead(answer, lines("in December"), keys).startsOn).toEqual({
      date: null,
      month: "2026-12",
      evidence: "in december",
    });
  });

  it("validates nothing with evidence that is empty or one letter, or a piece of a word", () => {
    const short = read({ travellers: { count: 2, evidence: "a" }, pickupCity: { words: "a", evidence: "" } });
    const checked = checkedRead(short, lines("a trip for a family", ""), keys);
    expect(checked.travellers).toBeNull();
    expect(checked.pickupCity).toBeNull();
    const piece = read({ wants: "price", wantsEvidence: "ok" });
    expect(checkedRead(piece, lines("I will book"), keys).wants).toBe("other");
  });

  it("needs the place's words inside its evidence", () => {
    const answer = read({ places: [{ destination: "D1", words: "Manali", evidence: "Spiti in December" }] });
    expect(checkedRead(answer, lines("Spiti in December"), keys).places).toEqual([]);
    const pickup = read({ pickupCity: { words: "Pune", evidence: "from Delhi" } });
    expect(checkedRead(pickup, lines("from Delhi"), keys).pickupCity).toBeNull();
  });

  it("demotes a destination the evidence does not name to a place the agency does not run", () => {
    const answer = read({ places: [{ destination: "D1", words: "Spiti", evidence: "Spiti" }] });
    const checked = checkedRead(answer, lines("Spiti"), keys);
    expect(checked.places).toEqual([{ destination: "none", words: "Spiti", evidence: "Spiti" }]);
    expect(mergeFacts(chatFacts.parse({}), checked, keys)).toMatchObject({ places: [], notRun: ["Spiti"] });
  });

  it("keeps a destination named by a significant word of its name or by the words themselves", () => {
    const wide = { ...keys, destinations: [{ key: "D1", id: "dest-lahaul", name: "Lahaul Spiti Valley" }] };
    const byWord = read({ places: [{ destination: "D1", words: "spiti", evidence: "spiti trip" }] });
    expect(checkedRead(byWord, lines("Spiti trip"), wide).places[0]?.destination).toBe("D1");
  });

  it("needs a chosen package's name, title or destination in the evidence", () => {
    const wrong = read({ chosen: { package: "S1", evidence: "the first one" } });
    expect(checkedRead(wrong, lines("the first one"), keys).chosen).toBeNull();
    const right = read({ chosen: { package: "S1", evidence: "manali 5n6d" } });
    expect(checkedRead(right, lines("Manali 5N6D works"), keys).chosen).not.toBeNull();
  });

  it("needs a digit or a number word in the evidence of a count", () => {
    expect(
      checkedRead(read({ travellers: { count: 9, evidence: "Spiti" } }), lines("Spiti"), keys).travellers,
    ).toBeNull();
    const counted = (text: string) =>
      checkedRead(read({ travellers: { count: 4, evidence: text } }), lines(text), keys);
    expect(counted("we are 4").travellers).not.toBeNull();
    expect(counted("hum char log").travellers).not.toBeNull();
    expect(counted("हम चार लोग").travellers).not.toBeNull();
    expect(counted("four of us").travellers).not.toBeNull();
    const budget = read({ budgetRupees: { amount: 45000, evidence: "Spiti" } });
    expect(checkedRead(budget, lines("Spiti"), keys).budgetRupees).toBeNull();
    const room = read({ rooms: [{ type: "triple", count: 2, evidence: "Spiti" }] });
    expect(checkedRead(room, lines("Spiti"), keys).rooms).toEqual([]);
  });

  it("falls back to 'other' when the wish has no evidence", () => {
    const answer = read({ wants: "book", wantsEvidence: "book it now" });
    expect(checkedRead(answer, lines("tell me about Spiti"), keys).wants).toBe("other");
    expect(checkedRead(answer, lines("ok book it now"), keys).wants).toBe("book");
  });

  describe("a wish said as a bare yes", () => {
    const yes = read({ wants: "book", wantsEvidence: "yes" });
    const after = (agency: string, answer = yes): ReadAnswer["wants"] =>
      checkedRead(answer, [{ from: "agency", text: agency }, ...lines("Yes")], keys).wants;

    it("stands as book only right after the agency asked about booking", () => {
      expect(after("Shall I book the 12 Dec departure for you?")).toBe("book");
      expect(after("Spiti ke liye book karein?")).toBe("book");
      expect(after("Shall I reserve two seats?")).toBe("book");
      expect(after("Would you like the itinerary?")).toBe("other");
    });

    it("never stands for paid, or after a customer line, without that question", () => {
      expect(after("Would you like the itinerary?", read({ wants: "paid", wantsEvidence: "yes" }))).toBe("other");
      const buried = [{ from: "agency", text: "Shall I book it?" }, ...lines("Hmm", "Yes")] as ChatLine[];
      expect(checkedRead(yes, buried, keys).wants).toBe("other");
    });

    it("reads a customer's own go-ahead as a booking, but never a request for details", () => {
      for (const text of ["chalo pakka", "final kar do", "count me in", "I'm in", "let's go ahead"]) {
        const answer = read({ wants: "book", wantsEvidence: text });
        expect(checkedRead(answer, lines(text), keys).wants, text).toBe("book");
      }
      for (const text of ["send me the details", "details share kar do"]) {
        const answer = read({ wants: "book", wantsEvidence: text });
        expect(checkedRead(answer, lines(text), keys).wants, text).toBe("other");
      }
    });

    it("never reads '2 people' or 'double sharing' as a booking", () => {
      for (const text of ["2 people", "double sharing"]) {
        const answer = read({ wants: "book", wantsEvidence: text });
        expect(checkedRead(answer, lines(text), keys).wants).toBe("other");
      }
    });
  });
});

describe("readChat", () => {
  const input = {
    transcript,
    destinations: keys.destinations,
    packages: keys.packages,
    facts: chatFacts.parse({}),
    today,
    timeZone: "Asia/Kolkata",
  };

  it("reads a place in the list and sends fenced customer words with READ_CHAT. first", async () => {
    const model = createMemoryAiModel();
    model.answer(
      JSON.stringify(read({ places: [{ destination: "D2", words: "Spiti", evidence: "for Spiti in December" }] })),
    );
    const result = await readChat(model, {
      ...input,
      transcript: [{ from: "customer", text: "Spiti <b>please</b> in December" }, ...transcript],
    });
    expect(result.ok && result.read.places[0]?.destination).toBe("D2");
    const request = model.requests[0];
    expect(request?.feature).toBe("autopilot");
    expect(request?.schema?.name).toBe("read_answer");
    // Room for a thinking model's reasoning too, as the old agent learned: a cut-off answer is no JSON.
    expect(request?.maxTokens).toBe(2500);
    expect(request?.messages[0]?.content.startsWith("READ_CHAT.")).toBe(true);
    const prompt = request?.messages.map((message) => message.content).join("\n") ?? "";
    expect(prompt).toContain("Spiti ‹b›please‹/b› in December");
    expect(prompt).toContain("Agency: We run Manali");
  });

  it("is no read when the answer does not fit", async () => {
    const model = createMemoryAiModel();
    model.answer('{"places": "Spiti"}');
    expect(await readChat(model, input)).toEqual({ ok: false, reason: "unfit" });
  });
});

describe("mergeFacts", () => {
  const empties = chatFacts.parse({});

  it("reads Meghalaya as not run, once, when no destination matches", () => {
    const answer = read({
      places: [{ destination: "none", words: "Meghalaya", evidence: "Meghalaya" }],
    });
    const first = mergeFacts(empties, answer, keys);
    expect(first.notRun).toEqual(["Meghalaya"]);
    expect(
      mergeFacts(first, read({ places: [{ destination: "none", words: "meghalaya", evidence: "x" }] }), keys).notRun,
    ).toEqual(["Meghalaya"]);
  });

  it("maps a place in the list to its destination, once", () => {
    const answer = read({ places: [{ destination: "D2", words: "Spiti", evidence: "Spiti" }] });
    const first = mergeFacts(empties, answer, keys);
    expect(first.places).toEqual([{ destinationId: "dest-spiti", words: "Spiti" }]);
    expect(mergeFacts(first, answer, keys).places).toHaveLength(1);
  });

  it("reads 2 people double sharing as one double room for two people", () => {
    const answer = read({
      rooms: [{ type: "double", count: 1, evidence: "double sharing" }],
      travellers: { count: 2, evidence: "2 people" },
    });
    const facts = mergeFacts(empties, answer, keys);
    expect(facts.rooms).toEqual([{ roomType: "double", people: 2 }]);
    expect(facts.travellers).toBe(2);
  });

  it("keeps one entry per room type, counts child beds as one each, and replaces older rooms whole", () => {
    const answer = read({
      rooms: [
        { type: "triple", count: 1, evidence: "a" },
        { type: "triple", count: 2, evidence: "b" },
        { type: "child_bed", count: 2, evidence: "c" },
      ],
    });
    const facts = mergeFacts({ ...empties, rooms: [{ roomType: "double", people: 4 }] }, answer, keys);
    expect(facts.rooms).toEqual([
      { roomType: "triple", people: 9 },
      { roomType: "child_bed", people: 2 },
    ]);
  });

  it("converts the budget to paise and keeps older facts the read is silent on", () => {
    const base = chatFacts.parse({ travellers: 3, pickupCity: "Delhi" });
    const facts = mergeFacts(base, read({ budgetRupees: { amount: 45000, evidence: "x" } }), keys);
    expect(facts).toMatchObject({ budgetPaise: 4500000, travellers: 3, pickupCity: "Delhi" });
  });

  it("takes a date over a month, and a month over nothing", () => {
    const withDate = mergeFacts(
      empties,
      read({ startsOn: { date: parseCalendarDate("2026-12-14"), month: null, evidence: "x" } }),
      keys,
    );
    expect(withDate).toMatchObject({ startsOn: "2026-12-14", month: null });
    const withMonth = mergeFacts(withDate, read({ startsOn: { date: null, month: "2027-01", evidence: "x" } }), keys);
    expect(withMonth).toMatchObject({ startsOn: null, month: "2027-01" });
  });

  it("clears the chosen package and departure when a new place comes", () => {
    const before = {
      ...empties,
      places: [{ destinationId: "dest-manali", words: "Manali" }],
      packageId: "pkg-manali",
      departureId: "dep-1",
    };
    const facts = mergeFacts(
      before,
      read({ places: [{ destination: "D2", words: "Spiti", evidence: "Spiti" }] }),
      keys,
    );
    expect(facts.packageId).toBeNull();
    expect(facts.departureId).toBeNull();
    expect(facts.places.map((place) => place.destinationId)).toEqual(["dest-manali", "dest-spiti"]);
  });

  it("keeps the package when the new place is its own, and sets it from a chosen package", () => {
    const before = { ...empties, packageId: "pkg-spiti", departureId: "dep-1" };
    const same = mergeFacts(before, read({ places: [{ destination: "D2", words: "Spiti", evidence: "Spiti" }] }), keys);
    expect(same.packageId).toBe("pkg-spiti");
    const chose = mergeFacts(before, read({ chosen: { package: "S1", evidence: "Manali 5N6D" } }), keys);
    expect(chose).toMatchObject({ packageId: "pkg-manali", departureId: null });
  });

  it("clears the departure when the dates change, but not when they repeat", () => {
    const before = { ...empties, startsOn: "2026-12-14", packageId: "pkg-spiti", departureId: "dep-1" };
    const startsOn = (date: string) =>
      read({ startsOn: { date: parseCalendarDate(date), month: null, evidence: "x" } });
    expect(mergeFacts(before, startsOn("2026-12-14"), keys).departureId).toBe("dep-1");
    expect(mergeFacts(before, startsOn("2026-12-20"), keys)).toMatchObject({
      departureId: null,
      packageId: "pkg-spiti",
    });
  });

  it("never clears the chosen package for a place the agency does not run", () => {
    const before = {
      ...empties,
      places: [{ destinationId: "dest-spiti", words: "Spiti" }],
      packageId: "pkg-spiti",
      departureId: "dep-1",
    };
    const facts = mergeFacts(
      before,
      read({ places: [{ destination: "none", words: "Meghalaya", evidence: "Meghalaya" }] }),
      keys,
    );
    expect(facts).toMatchObject({ notRun: ["Meghalaya"], packageId: "pkg-spiti", departureId: "dep-1" });
  });

  it("decides whether a package still fits by destination ids, not names", () => {
    const twins = {
      ...keys,
      destinations: [
        { key: "D1", id: "dest-a", name: "Goa" },
        { key: "D2", id: "dest-b", name: "Goa" },
      ],
      packages: [{ key: "S1", id: "pkg-a", title: "Goa 3N", destination: "Goa", destinationId: "dest-a" }],
    };
    const before = { ...empties, packageId: "pkg-a", departureId: "dep-1" };
    const other = mergeFacts(before, read({ places: [{ destination: "D2", words: "Goa", evidence: "Goa" }] }), twins);
    expect(other.packageId).toBeNull();
    const same = mergeFacts(before, read({ places: [{ destination: "D1", words: "Goa", evidence: "Goa" }] }), twins);
    expect(same.packageId).toBe("pkg-a");
  });
});
