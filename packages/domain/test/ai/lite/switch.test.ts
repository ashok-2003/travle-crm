// The lite agent's per-agency switch: only platform staff set it, an agency's own saves leave it alone, and it counts
// only while the AI module's switch is on too.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  autopilotOf,
  liteAgentOn,
  saveAgencyAnswers,
  saveAgentBasics,
  saveAiSettings,
  saveAutopilot,
  setAgentOn,
  setLiteAgent,
} from "../../../src/ai/index.js";
import { newUuidV7, parseCalendarDate, platformActor } from "../../../src/kernel/index.js";
import { anAgency, memberOf } from "../../imports/support/test-imports.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";

const today = parseCalendarDate("2026-11-10");
const aiSettings = {
  enabled: true,
  scoring: true,
  fillLeads: true,
  writeStyle: "warm",
  customTrips: false,
  instructions: "",
} as const;

describe("the lite agent's switch", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function agency() {
    const organizationId = await anAgency(test, "Lite switch agency");
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    return {
      organizationId,
      inOrg,
      owner: memberOf(organizationId, "org-owner"),
      staff: platformActor(organizationId, newUuidV7()),
    };
  }

  it("setLiteAgent turns it on once", async () => {
    const on = await agency();
    expect(await on.inOrg((tx) => setLiteAgent(tx, on.staff, true))).toBe(true);
    expect((await on.inOrg((tx) => autopilotOf(tx))).lite).toBe(true);
    expect(await on.inOrg((tx) => setLiteAgent(tx, on.staff, true))).toBe(false);
    const entries = await on.inOrg((tx) =>
      tx.auditEntry.findMany({ where: { action: { startsWith: "ai-agent.lite" } } }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "ai-agent.lite-on",
      entityType: "ai_autopilot",
      before: { lite: false },
      after: { lite: true },
    });
    expect(await on.inOrg((tx) => setLiteAgent(tx, on.staff, false))).toBe(true);
    expect(await on.inOrg((tx) => tx.auditEntry.findMany({ where: { action: "ai-agent.lite-off" } }))).toHaveLength(1);
  });

  it("agency writes leave the switch", async () => {
    const on = await agency();
    await on.inOrg((tx) => setLiteAgent(tx, on.staff, true));
    const lite = () => on.inOrg(async (tx) => (await autopilotOf(tx)).lite);
    // The agency's screen sends back everything it read, so a stray `lite` in the input must not be written either.
    await on.inOrg(async (tx) => {
      const sentBack = { ...(await autopilotOf(tx)), lite: false };
      await saveAutopilot(tx, on.owner, sentBack, today);
    });
    expect(await lite()).toBe(true);
    await on.inOrg((tx) => setAgentOn(tx, on.owner, false, today));
    expect(await lite()).toBe(true);
    await on.inOrg((tx) => saveAgentBasics(tx, on.owner, { agentName: "Riya", tone: "friendly" }));
    expect(await lite()).toBe(true);
    await on.inOrg((tx) => saveAgencyAnswers(tx, on.owner, { answers: { cancellation: "a" } }));
    expect(await lite()).toBe(true);
  });

  it("liteAgentOn needs the AI module's switch", async () => {
    const on = await agency();
    const context = { providerReady: true, now: new Date("2026-11-10T10:00:00Z") };
    expect(await on.inOrg((tx) => liteAgentOn(tx))).toBe(false);
    await on.inOrg((tx) => setLiteAgent(tx, on.staff, true));
    await on.inOrg((tx) => saveAiSettings(tx, on.owner, aiSettings, context));
    expect(await on.inOrg((tx) => liteAgentOn(tx))).toBe(true);
    await on.inOrg((tx) => saveAiSettings(tx, on.owner, { ...aiSettings, enabled: false }, context));
    expect(await on.inOrg((tx) => liteAgentOn(tx))).toBe(false);
  });
});
