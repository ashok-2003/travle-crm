// The agency's answers to the fixed questions, and the agent's name and tone: saved and read back, a blank answer removed,
// the autopilot's other columns left alone, and the audit holding no answer text.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencyAnswersOf, agentBasicsOf, autopilotOf, saveAgencyAnswers, saveAgentBasics } from "../../src/ai/index.js";
import { storeAutopilot } from "./support/store-autopilot.js";
import { anAgency, auditOf, createTestImports, memberOf, type TestImports } from "../imports/support/test-imports.js";

describe("the agency's answers and the agent's basics", () => {
  let test: TestImports;
  beforeAll(() => {
    test = createTestImports();
  });
  afterAll(() => test.close());

  async function agency() {
    const organizationId = await anAgency(test, "Answers agency");
    const owner = memberOf(organizationId, "org-owner");
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    return { organizationId, owner, inOrg };
  }

  it("reads nothing for an agency that saved none, then reads back what was saved", async () => {
    const { owner, inOrg } = await agency();
    expect(await inOrg((tx) => agencyAnswersOf(tx))).toEqual({});
    await inOrg((tx) =>
      saveAgencyAnswers(tx, owner, { answers: { cancellation: "Free up to 30 days before.", children: "From 5." } }),
    );
    expect(await inOrg((tx) => agencyAnswersOf(tx))).toEqual({
      cancellation: "Free up to 30 days before.",
      children: "From 5.",
    });
  });

  it("removes an answer that is saved blank, and a topic left out of a save", async () => {
    const { owner, inOrg } = await agency();
    await inOrg((tx) => saveAgencyAnswers(tx, owner, { answers: { refunds: "In 7 days.", safety: "Guides." } }));
    await inOrg((tx) => saveAgencyAnswers(tx, owner, { answers: { refunds: "   ", safety: "Guides." } }));
    expect(await inOrg((tx) => agencyAnswersOf(tx))).toEqual({ safety: "Guides." });
  });

  it("refuses an answer over 500 characters", async () => {
    const { owner, inOrg } = await agency();
    await expect(
      inOrg((tx) => saveAgencyAnswers(tx, owner, { answers: { refunds: "x".repeat(501) } })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("saving the basics changes the name and tone and leaves every other autopilot column as it was", async () => {
    const { owner, inOrg } = await agency();
    const before = await inOrg(async (tx) => {
      await storeAutopilot(tx, owner.organizationId, {
        strictRules: "No discounts.",
        paymentDetails: "UPI x",
        maxRepliesPerDay: 7,
      });
      return autopilotOf(tx);
    });
    expect(await inOrg((tx) => agentBasicsOf(tx))).toEqual({ agentName: "", tone: "friendly" });
    await inOrg((tx) => saveAgentBasics(tx, owner, { agentName: "Riya", tone: "professional" }));
    const after = await inOrg((tx) => autopilotOf(tx));
    expect(after).toEqual({ ...before, agentName: "Riya", tone: "professional" });
    expect(await inOrg((tx) => agentBasicsOf(tx))).toEqual({ agentName: "Riya", tone: "professional" });
  });

  it("saves the basics for an agency with no autopilot row yet", async () => {
    const { owner, inOrg } = await agency();
    await inOrg((tx) => saveAgentBasics(tx, owner, { agentName: "Asha", tone: "friendly" }));
    expect(await inOrg((tx) => agentBasicsOf(tx))).toEqual({ agentName: "Asha", tone: "friendly" });
  });

  it("audits the topics answered and the basics' lengths, never the words", async () => {
    const { organizationId, owner, inOrg } = await agency();
    await inOrg((tx) => saveAgencyAnswers(tx, owner, { answers: { cancellation: "SECRETPOLICY", children: "" } }));
    await inOrg((tx) => saveAgentBasics(tx, owner, { agentName: "SECRETNAME", tone: "professional" }));
    const entries = await auditOf(test, organizationId, organizationId);
    const actions = entries.map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["ai-agent.answers-changed", "ai-agent.basics-changed"]));
    const answers = entries.find((entry) => entry.action === "ai-agent.answers-changed");
    expect(answers?.after).toEqual({ answered: ["cancellation"] });
    const basics = entries.find((entry) => entry.action === "ai-agent.basics-changed");
    expect(basics?.after).toEqual({ tone: "professional", agentNameLength: 10 });
    const text = JSON.stringify(entries);
    expect(text).not.toContain("SECRETPOLICY");
    expect(text).not.toContain("SECRETNAME");
  });
});
