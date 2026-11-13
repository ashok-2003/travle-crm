// The one agent obeys the agency and the customer: off by default; no AI for an agency whose plan lacks it or whose
// subscription is read-only, suspended or cancelled; STOP wins in every chat, one with no person linked too; only inside
// the 24-hour window; never past the shared monthly limit; never while a person answers; a customer's erasure takes its
// memory of them.
import { randomUUID } from "node:crypto";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { MONTHLY_AI_LIMIT } from "../../../src/ai/index.js";
import { monthStartOf } from "../../../src/inbox/index.js";
import { systemActor } from "../../../src/kernel/index.js";
import { eraseCustomerParts } from "../../../src/platform/erase-customer.js";
import type { Entitlements } from "../../../src/subscriptions/index.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteEntitlements } from "./support/lite-agency.js";
import { greeting, outbound, understood, written, type Agency } from "./support/turn-script.js";

describe("the agent's gates", () => {
  let test: TestInbox;
  let platformDb: PlatformDatabase;
  beforeAll(() => {
    test = createTestInbox();
    platformDb = createPlatformDatabase(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
  });

  const script = (on: Agency) => {
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
  };
  const plan = (status: Entitlements["status"], modules = ["crm", "inbox", "ai"]): Entitlements => ({
    ...liteEntitlements,
    status,
    modules: new Set(modules) as Entitlements["modules"],
  });

  it("is off by default and asks the model nothing", async () => {
    const off = await liteAgency(test);
    await off.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { autopilot: false } }));
    script(off);
    expect(await off.turn()).toBe("off");
    expect(off.model.requests).toHaveLength(0);
    expect(await outbound(off)).toHaveLength(0);
  });

  it("gives no AI to an agency whose plan lacks it or whose subscription is read-only, suspended or cancelled", async () => {
    const on = await liteAgency(test);
    script(on);
    for (const status of ["read_only", "suspended", "cancelled"] as const)
      expect(await on.turn(undefined, { entitlements: plan(status) })).toBe("not_allowed");
    expect(await on.turn(undefined, { entitlements: plan("active", ["crm", "inbox"]) })).toBe("not_allowed");
    expect(on.model.requests).toHaveLength(0);
  });

  it("lets STOP win in a chat of a person, and in one with no person linked", async () => {
    const stopped = await liteAgency(test);
    await stopped.inOrg(async (tx) => {
      const personId = (await tx.whatsappConversation.findFirstOrThrow()).personId;
      if (personId === null) throw new Error("the chat has no person");
      await tx.personConsent.create({
        data: {
          personId,
          purpose: "whatsapp",
          action: "withdrawn",
          wording: "STOP",
          wordingVersion: 1,
          source: "customer",
          recordedAt: testNow,
        },
      });
    });
    script(stopped);
    expect(await stopped.turn()).toBe("opted_out");
    const unlinked = await liteAgency(test);
    await unlinked.inOrg(async (tx) => {
      await tx.whatsappConversation.updateMany({ data: { personId: null } });
      await tx.whatsappMessage.create({
        data: {
          conversationId: unlinked.chat.id,
          direction: "in",
          origin: "customer",
          kind: "text",
          body: "STOP",
          wamid: randomUUID(),
          status: "received",
          occurredAt: new Date(testNow.getTime() + 1000),
        },
      });
    });
    script(unlinked);
    expect(await unlinked.turn()).toBe("opted_out");
    expect(stopped.model.requests.length + unlinked.model.requests.length).toBe(0);
  });

  it("writes only inside the 24-hour window, within the monthly limit, and never while a person answers", async () => {
    const late = await liteAgency(test);
    script(late);
    expect(await late.turn(new Date(testNow.getTime() + 25 * 3_600_000))).toBe("window_closed");
    const full = await liteAgency(test);
    await full.inOrg((tx) =>
      tx.aiUsage.create({
        data: { month: monthStartOf(new Date(testNow.getTime() + 60_000), "Asia/Kolkata"), calls: MONTHLY_AI_LIMIT },
      }),
    );
    script(full);
    expect(await full.turn()).toBe("limit");
    const busy = await liteAgency(test);
    await busy.inOrg((tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: busy.chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "I will call you",
          status: "sent",
          occurredAt: new Date(testNow.getTime() + 30_000),
        },
      }),
    );
    script(busy);
    expect(["answered", "person_answering"]).toContain(await busy.turn());
    expect(late.model.requests.length + full.model.requests.length + busy.model.requests.length).toBe(0);
  });

  it("is erased with the customer: its memory of the chat, and the earlier agents' lessons", async () => {
    const on = await liteAgency(test);
    script(on);
    await on.turn();
    await on.inOrg((tx) => tx.aiLearning.create({ data: { kind: "need", text: "People ask for Kedarnath" } }));
    const personId = (await on.inOrg((tx) => tx.whatsappConversation.findFirstOrThrow())).personId ?? "";
    await platformDb.transaction((tx) =>
      eraseCustomerParts(tx, systemActor(on.organizationId), { organizationId: on.organizationId, personId }, testNow),
    );
    expect(await on.inOrg((tx) => tx.aiChat.count())).toBe(0);
    expect(await on.inOrg((tx) => tx.aiLearning.count())).toBe(0);
  });
});
