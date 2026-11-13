// What the console reads of an agency's AI agent: on or off, the required setup steps still undone in the Setup tab's
// order, whether its plan has the AI, and whether it is ready to answer.
import { randomUUID } from "node:crypto";
import { AGENCY_PAYMENT_QR_RECORD_TYPE } from "@travel-crm/contracts/files";
import { softDeleted } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainError } from "../../src/kernel/index.js";
import { organizationAgentState } from "../../src/platform/index.js";
import { liteAgency, liteTurnAt } from "../ai/lite/support/lite-agency.js";
import { createTestInbox } from "../inbox/support.js";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

describe("an agency's AI agent state in the console", () => {
  let test: TestPlatform;

  beforeAll(() => {
    test = createTestPlatform();
  });
  afterAll(async () => {
    await test.close();
  });

  const stateOf = (organizationId: string) => organizationAgentState(test.services, organizationId, liteTurnAt);
  /** A subscription on a plan with these modules, as onboarding gives every agency. */
  const subscribe = (organizationId: string, modules: string[]) =>
    test.services.platformDb.transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          key: `plan-${randomUUID().slice(0, 8)}`,
          name: "Starter",
          monthlyPricePaise: 250_000,
          seatLimit: 5,
          whatsappNumberLimit: 1,
          storageLimitBytes: 5_000_000_000n,
          modules,
        },
      });
      await tx.subscription.create({
        data: {
          organizationId,
          planId: plan.id,
          billingCycle: "monthly",
          status: "trial",
          statusChangedAt: liteTurnAt,
          trialEndsOn: new Date("2099-01-01"),
        },
      });
    });

  it("an agency on with its setup finished is ready to answer", async () => {
    const inbox = createTestInbox();
    try {
      const ready = await liteAgency(inbox);
      await subscribe(ready.organizationId, ["crm", "inbox", "ai"]);
      expect(await stateOf(ready.organizationId)).toEqual({ on: true, missing: [], planHasAi: true, answering: true });
    } finally {
      await inbox.close();
    }
  });

  it("names the missing steps in the Setup tab's order, and is on but not answering", async () => {
    const inbox = createTestInbox();
    try {
      const unready = await liteAgency(inbox, { ready: false });
      await subscribe(unready.organizationId, ["crm", "inbox", "ai"]);
      // No UPI ID, no whole bank account and no QR picture: nothing a customer could pay to.
      await unready.inOrg(async (tx) => {
        await tx.organizationProfile.updateMany({ data: { upiId: null, bankAccountNumber: null, bankIfsc: null } });
        await tx.attachment.updateMany({
          where: { recordType: AGENCY_PAYMENT_QR_RECORD_TYPE },
          data: softDeleted(randomUUID()),
        });
      });
      expect(await stateOf(unready.organizationId)).toEqual({
        on: true,
        // Without payment details no package is sellable either, so that step is undone too.
        missing: ["packages", "payment", "answers"],
        planHasAi: true,
        answering: false,
      });
    } finally {
      await inbox.close();
    }
  });

  it("reads as off when the AI module or the agent switch is off", async () => {
    const inbox = createTestInbox();
    try {
      const aiOff = await liteAgency(inbox);
      await aiOff.inOrg((tx) => tx.aiSettings.updateMany({ data: { enabled: false } }));
      expect(await stateOf(aiOff.organizationId)).toMatchObject({ on: false, answering: false });
      const agentOff = await liteAgency(inbox);
      await agentOff.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { autopilot: false } }));
      expect(await stateOf(agentOff.organizationId)).toMatchObject({ on: false, answering: false });
    } finally {
      await inbox.close();
    }
  });

  it("a plan without the AI answers nothing, whatever the agency's switch and setup say", async () => {
    const inbox = createTestInbox();
    try {
      const downgraded = await liteAgency(inbox);
      await subscribe(downgraded.organizationId, ["crm", "inbox"]);
      expect(await stateOf(downgraded.organizationId)).toEqual({
        on: true,
        missing: [],
        planHasAi: false,
        answering: false,
      });
    } finally {
      await inbox.close();
    }
  });

  it("an unknown organization is NOT_FOUND", async () => {
    await expect(organizationAgentState(test.services, randomUUID())).rejects.toSatisfy(
      (error) => error instanceof DomainError && error.code === "NOT_FOUND",
    );
  });
});
