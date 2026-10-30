// Ask your reports, the AI's half: off until the agency turns the AI on; the model is told the question and the catalogue and
// nothing of the agency's data; it answers a report and a range, or that it cannot (anything else counts as cannot); the
// call is given back when the AI fails; and the question is kept nowhere.
import { randomUUID } from "node:crypto";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { chooseReport, chosenFrom, MONTHLY_AI_LIMIT, saveAiSettings } from "../../src/ai/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { reportsFor } from "../../src/reports/index.js";
import { aLead } from "../crm/support/records.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const now = new Date("2026-11-10T06:00:00Z");
const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("ask reports: choosing the report", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let owner: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const catalogue = () => reportsFor(owner);

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Ask the AI");
    owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
    await inOrg((tx) => aLead(tx, { ownerUserId: owner.userId, stage: "new" }));
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  const turnOn = () =>
    inOrg((tx) =>
      saveAiSettings(tx, owner, { enabled: true, scoring: true, instructions: "" }, { providerReady: true, now }),
    );

  it("is off until the agency turns the AI on, and asks the model nothing while off", async () => {
    const model = createMemoryAiModel();
    expect(await reasonOf(chooseReport(db, model, owner, "leads by source", catalogue(), now))).toBe("AI_OFF");
    expect(model.requests).toHaveLength(0);
  });

  it("tells the model the question and the catalogue only, and returns the report and range it chose", async () => {
    await turnOn();
    const model = createMemoryAiModel();
    model.answer('{"queryId":"leads_by_source","params":{"range":"last_month"}}');
    const result = await chooseReport(db, model, owner, "how many leads from Instagram last month", catalogue(), now);
    expect(result.chosen).toEqual({ kind: "report", queryId: "leads_by_source", range: "last_month" });
    expect(result.monthlyLimit).toBe(MONTHLY_AI_LIMIT);
    const [request] = model.requests;
    expect(request?.feature).toBe("ask_report");
    const prompt = JSON.stringify(request?.messages);
    expect(prompt).toContain("how many leads from Instagram last month");
    expect(prompt).toContain("leads_by_source");
    // Nothing of the agency's own data: no person, lead or destination is named.
    expect(prompt).not.toMatch(/Rahul|Manali|98765/);
    // The question is kept nowhere: the month's count is all there is.
    expect(await inOrg((tx) => tx.aiUsage.findMany())).toMatchObject([{ calls: 1 }]);
  });

  it("reads a decline, junk and an unknown report as cannot, with the nearest known reports", () => {
    const list = catalogue();
    expect(chosenFrom('{"cannot":"no","closest":["lost_leads","nonsense","quotes","overview","team"]}', list)).toEqual({
      kind: "cannot",
      closest: ["lost_leads", "quotes", "overview"],
    });
    expect(chosenFrom("I do not know", list)).toEqual({ kind: "cannot", closest: [] });
    expect(chosenFrom('{"queryId":"drop_table"}', list)).toEqual({ kind: "cannot", closest: [] });
  });

  it("uses 30 days when the model names no range, and no range for a report about now", () => {
    const list = catalogue();
    expect(chosenFrom('{"queryId":"quotes","params":{}}', list)).toEqual({
      kind: "report",
      queryId: "quotes",
      range: "30d",
    });
    expect(chosenFrom('{"queryId":"quotes","params":{"range":"forever"}}', list)).toMatchObject({ range: "30d" });
    expect(chosenFrom('{"queryId":"follow_ups_overdue","params":{"range":"7d"}}', list)).toEqual({
      kind: "report",
      queryId: "follow_ups_overdue",
      range: null,
    });
  });

  it("never picks a report the member is not offered", () => {
    const offered = catalogue().filter((entry) => entry.id !== "team");
    expect(chosenFrom('{"queryId":"team","params":{"range":"7d"}}', offered)).toEqual({ kind: "cannot", closest: [] });
  });

  it("gives the call back when the AI does not answer", async () => {
    const model = createMemoryAiModel();
    const before = await inOrg((tx) => tx.aiUsage.findMany());
    model.answer({ ok: false, reason: "unavailable" });
    expect(await reasonOf(chooseReport(db, model, owner, "anything at all", catalogue(), now))).toBe("AI_UNAVAILABLE");
    expect(await inOrg((tx) => tx.aiUsage.findMany())).toEqual(before);
  });
});
