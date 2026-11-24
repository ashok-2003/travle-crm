// The seams natural opens for a second agent in its tools, trace, log line and ends: one's names, words and kept
// schemas, with natural's own behaviour unchanged.
import { oneToolSchemas } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { handOverText } from "../../../src/ai/natural/hand-over-words.js";
import { fallbackTask } from "../../../src/ai/natural/loop/words.js";
import { startNaturalTrace } from "../../../src/ai/natural/trace.js";
import { naturalTurnStart, logNaturalTurn } from "../../../src/ai/natural/turn-note.js";
import type { StagedAction } from "../../../src/ai/natural/types.js";
import type { LiteTurnInput } from "../../../src/ai/lite/types.js";
import type { TurnDone } from "../../../src/ai/natural/turn-done.js";
import { createMemoryLogger } from "@travel-crm/integrations/logging";

const input = {
  kind: "reply",
  organizationId: "org-1",
  conversationId: "chat-1",
  token: "t",
} as unknown as LiteTurnInput;
const prompt = { version: "v2", source: undefined } as unknown as Parameters<typeof naturalTurnStart>[1];

describe("natural's seams for tools, trace and ends", () => {
  it("says b2b to the team", () => {
    expect(handOverText({ reason: "b2b", summary: "Rates for 20 pax" })).toBe(
      "Asks about a business booking or agent rates: Rates for 20 pax",
    );
  });

  it("summarises a book with no name or words", () => {
    const action: StagedAction = {
      tool: "book",
      terms: { packageId: "p1", startsOn: "2026-12-19", adults: 2, childrenAges: [], room: "double", payInFull: false },
      figures: { totalPaise: 2_599_800 } as never,
      fullName: null,
      customerWords: null,
      via: "offer",
    };
    const trace = startNaturalTrace({ version: "v2" }, 0);
    trace.staged(new Map([["book", action]]));
    const [summary] = trace.finish("sent", null, 1).staged;
    expect(summary?.summary).toBe("Sat 19 Dec 2026, 2 adults, double; total ₹25,998 (the live offer)");
  });

  it("names a one turn's trace and log line", () => {
    expect(startNaturalTrace({ version: "v2" }, 0, "one").finish("sent", null, 1).agent).toBe("one");
    expect(startNaturalTrace({ version: "v2" }, 0).finish("sent", null, 1).agent).toBe("natural");
    const start = naturalTurnStart(input, prompt, null, "one");
    expect(start.name).toBe("whatsapp-agent.one.reply");
    expect(start.tags).toEqual(["whatsapp-agent", "one", "reply"]);
    expect(start.metadata).toMatchObject({ agent: "one" });
    expect(naturalTurnStart(input, prompt, null).name).toBe("whatsapp-agent.natural.reply");
    const logger = createMemoryLogger();
    const done = { outcome: "sent", reason: null } as unknown as TurnDone;
    logNaturalTurn(logger, input, done, 2, 30, "one");
    expect(logger.entries[0]).toMatchObject({ event: "ai.turn", agent: "one" });
  });

  it("says why a turn that ran out of steps fell back", () => {
    const task = fallbackTask({ reason: "steps", customerText: "", dropped: [], draft: null });
    expect(task).toContain("The AI took too many steps without a reply it could send");
  });

  it("keeps natural's hand-over reasons and book wording out of one's tool schemas", () => {
    const schemas = Object.fromEntries(oneToolSchemas({ tripLabels: ["T1"] }).map((tool) => [tool.name, tool]));
    const terms = { trip_id: "T1", date: "2026-12-19", adults: 2 };
    // A schema is strict: a field it doesn't list is refused, so its absence from the schema is what these show.
    expect(schemas.hand_over?.schema.safeParse({ reason: "b2b", summary: "Agent rates" }).success).toBe(true);
    expect(schemas.book?.schema.safeParse(terms).success).toBe(true);
    expect(schemas.book?.schema.safeParse({ ...terms, customer_words: "haan" }).success).toBe(false);
    expect(schemas.book?.schema.safeParse({ ...terms, full_name: "Rohan Mehta" }).success).toBe(false);
    expect(schemas.book?.description).not.toMatch(/customer_words|full name/iu);
  });
});
