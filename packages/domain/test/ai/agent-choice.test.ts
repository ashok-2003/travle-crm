// Which agent answers an agency: lite until platform staff move it, audited in the agency's own log, and left alone when
// the agency saves its own settings.
import { calendarDateIn, platformActor } from "../../src/kernel/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agentOf,
  saveAgencyAnswers,
  saveAgentBasics,
  saveAiSettings,
  setAgent,
  setAgentOn,
} from "../../src/ai/index.js";
import { anAgency, auditOf, createTestImports, memberOf, type TestImports } from "../imports/support/test-imports.js";

describe("an agency's agent", () => {
  let test: TestImports;
  beforeAll(() => {
    test = createTestImports();
  });
  afterAll(() => test.close());

  async function agency() {
    const organizationId = await anAgency(test, "Agent choice agency");
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const admin = platformActor(organizationId, crypto.randomUUID());
    return { organizationId, inOrg, admin, owner: memberOf(organizationId, "org-owner") };
  }

  it("reads natural for an agency that never chose", async () => {
    const { inOrg } = await agency();
    expect(await inOrg((tx) => agentOf(tx))).toBe("natural");
  });

  it("records a change in the agency's audit log under the admin's name, and nothing when unchanged", async () => {
    const { organizationId, inOrg, admin } = await agency();
    expect(await inOrg((tx) => setAgent(tx, admin, "natural"))).toEqual({ changed: false });
    expect(await inOrg((tx) => setAgent(tx, admin, "lite"))).toEqual({ changed: true });
    expect(await inOrg((tx) => setAgent(tx, admin, "lite"))).toEqual({ changed: false });
    expect(await inOrg((tx) => agentOf(tx))).toBe("lite");
    const entries = (await auditOf(test, organizationId, organizationId)).filter(
      (entry) => entry.action === "ai-agent.agent-changed",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source: "platform",
      actorUserId: admin.userId,
      before: { agent: "natural" },
      after: { agent: "lite" },
    });
  });

  it("leaves the agent as it was when the agency saves its own settings", async () => {
    const { inOrg, admin, owner } = await agency();
    await inOrg((tx) => setAgent(tx, admin, "lite"));
    await inOrg((tx) =>
      saveAiSettings(tx, owner, { enabled: true, scoring: true }, { providerReady: true, now: new Date() }),
    );
    await inOrg((tx) => saveAgentBasics(tx, owner, { agentName: "Riya", tone: "professional" }));
    await inOrg((tx) => saveAgencyAnswers(tx, owner, { answers: { refunds: "In 7 days." } }));
    await inOrg((tx) => setAgentOn(tx, owner, false, calendarDateIn(new Date(), "Asia/Kolkata")));
    expect(await inOrg((tx) => agentOf(tx))).toBe("lite");
  });
});
