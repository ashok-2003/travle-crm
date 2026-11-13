// The outline of the lite agent's two model calls matches the requests the builders really make.
import { lookupTools } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { modelCalls } from "../../../src/ai/lite/prompts/calls.js";
import { promptLibrary } from "../../../src/ai/lite/prompts/library.js";
import { understandRequest, type UnderstandPromptInput } from "../../../src/ai/lite/prompts/understand-prompt.js";
import { writeRequest } from "../../../src/ai/lite/prompts/write-prompt.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const today = parseCalendarDate("2026-11-12");
const at = (time: string) => new Date(`2026-11-12T${time}Z`);
const messages = [
  { id: "1", from: "customer" as const, at: at("08:00:00"), kind: "text", text: "Hi, I saw your ad" },
  { id: "2", from: "you" as const, at: at("08:01:00"), kind: "text", text: "Hello! Which trip?" },
];
const entry = (n: number) => ({
  id: `p${String(n)}`,
  title: `Trip ${String(n)}`,
  place: `Place ${String(n)}`,
  destinationId: null,
  nights: 3,
  startCity: "Delhi",
});
const understandInput = (packages: number): UnderstandPromptInput => ({
  agencyName: "Hills Travel",
  packages: Array.from({ length: packages }, (_, n) => entry(n)),
  now: at("10:20:00"),
  today,
  timeZone: "Asia/Kolkata",
  lead: {
    name: "Riya",
    stage: "contacted",
    packageTitle: null,
    place: "Kedarnath",
    when: { month: "2026-12" },
    adults: null,
    childrenAges: [],
    pickupCity: null,
    roomType: null,
  },
  summary: "Wants Kedarnath in December.",
  timeline: [{ at: at("09:00:00"), kind: "note", text: "Called, no answer" }],
  messages,
});

describe("the model calls' outline", () => {
  const [understand, write] = modelCalls();

  it("each call lists its request's blocks in order", () => {
    const listed = understandRequest(understandInput(2)).blocks;
    const titles = (understand?.blocks ?? []).map((head) => head.title);
    expect(Object.keys(listed)).toEqual(titles.filter((title) => title !== "Places we run"));
    for (const head of understand?.blocks ?? [])
      expect(listed[head.title]?.startsWith(`## ${head.title}\n${head.purpose}\n`)).toBe(true);

    const many = understandRequest(understandInput(31)).blocks;
    expect(Object.keys(many)).toContain("Places we run");
    expect(Object.keys(many)).not.toContain("Package index");

    const { blocks } = writeRequest({
      agentName: "Asha",
      agencyName: "Hills Travel",
      tone: "friendly",
      instruction: "Greet the customer.",
      facts: ["fact"],
      looked: ["looked up line"],
      summary: "Wants Kedarnath.",
      messages,
      language: "english",
      correction: "it named a price",
      timeZone: "Asia/Kolkata",
      today,
    });
    const writeTitles = (write?.blocks ?? []).map((head) => head.title);
    expect(Object.keys(blocks)).toEqual(writeTitles);
    expect(writeTitles).toHaveLength(8);
    for (const head of write?.blocks ?? [])
      expect(blocks[head.title]?.startsWith(`## ${head.title}\n${head.purpose}\n`)).toBe(true);
  });

  it("every system piece is in the library, and fixed.texts in no call", () => {
    const names = promptLibrary().map((piece) => piece.name);
    for (const call of [understand, write]) {
      for (const piece of call?.system ?? []) expect(names).toContain(piece);
      expect(call?.system).not.toContain("fixed.texts");
    }
  });

  it("Understand offers the five lookups and Write none", () => {
    expect(understand?.lookups).toEqual([...lookupTools]);
    expect(write?.lookups).toEqual([]);
  });
});
