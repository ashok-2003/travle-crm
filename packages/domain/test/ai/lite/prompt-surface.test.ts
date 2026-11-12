// The two prompts as the model reads them, rendered for a fixed chat and kept in files: a changed word shows in review.
import { describe, expect, it } from "vitest";
import { understandRequest } from "../../../src/ai/lite/prompts/understand-prompt.js";
import { writeRequest } from "../../../src/ai/lite/prompts/write-prompt.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import type { AiRequest } from "@travel-crm/integrations/ai";

const today = parseCalendarDate("2026-11-12");
const at = (time: string) => new Date(`2026-11-12T${time}Z`);
const messages = [
  { id: "1", from: "customer" as const, at: at("08:00:00"), kind: "text", text: "Hi, I saw your ad" },
  { id: "2", from: "you" as const, at: at("08:01:00"), kind: "text", text: "Hello! Which trip are you thinking of?" },
  {
    id: "3",
    from: "customer" as const,
    at: at("10:10:00"),
    kind: "text",
    text: "kedarnath, 3 adults and a kid of 8, 15 dec",
  },
];

const shown = (request: AiRequest): string =>
  request.messages.map((one) => `# ${one.role}\n\n${one.content}`).join("\n\n") +
  `\n\n# schema ${request.schema?.name ?? ""} · feature ${request.feature} · maxTokens ${String(request.maxTokens)}\n`;

describe("the prompts' surfaces", () => {
  it("Understand", async () => {
    const { request } = understandRequest({
      agencyName: "Hills Travel",
      packages: [
        {
          id: "p1",
          title: "Kedarnath Yatra 4N",
          place: "Kedarnath",
          destinationId: null,
          nights: 4,
          startCity: "Delhi",
        },
      ],
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
      summary: "Family trip; worried about the cold.",
      timeline: [
        { at: at("09:00:00"), kind: "note", text: "Called, no answer" },
        { at: at("07:00:00"), kind: "stage", text: "contacted" },
      ],
      messages,
    });
    await expect(shown(request)).toMatchFileSnapshot("./surfaces/understand.md");
  });

  it("Write", async () => {
    const { request } = writeRequest({
      agentName: "Riya",
      agencyName: "Hills Travel",
      tone: "friendly",
      instruction: "Ask for their pickup city.",
      facts: ["Package: Kedarnath Yatra 4N", "From price: [from price 1]"],
      looked: ["Kedarnath Yatra 4N: 4 nights from Delhi"],
      summary: "Family trip; worried about the cold.",
      messages,
      language: "hinglish",
      correction: null,
      today,
      timeZone: "Asia/Kolkata",
    });
    await expect(shown(request)).toMatchFileSnapshot("./surfaces/write.md");
  });
});
