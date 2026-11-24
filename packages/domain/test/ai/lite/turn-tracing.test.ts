// A turn the checks stop before any model call is still one traced turn of its chat, its outcome noted (agent.ts); the
// one agent's own turns trace themselves (one/turn.test.ts).
import { createMemoryTracing, notedTurn, type MemoryTracing } from "@travel-crm/integrations/tracing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Entitlements } from "../../../src/subscriptions/index.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteEntitlements } from "./support/lite-agency.js";

const shown = (tracing: MemoryTracing, index = 0) => {
  const turn = tracing.turns[index];
  return turn === undefined ? null : notedTurn(turn);
};

describe("a stopped turn as a trace", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("a turn stopped before any model call is still traced, with why", async () => {
    const on = await liteAgency(test);
    const tracing = createMemoryTracing();
    const entitlements: Entitlements = { ...liteEntitlements, modules: new Set(["crm", "inbox"]) };
    expect(await on.turn(undefined, { tracing, entitlements })).toBe("not_allowed");
    expect(tracing.turns[0]?.generations).toEqual([]);
    expect(shown(tracing)).toMatchObject({ metadata: { outcome: "not_allowed" }, statusMessage: "not_allowed" });
  });
});
