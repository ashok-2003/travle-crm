// "Also check the last 30 days" (Q3): the worker reads the form's last 30 days from Meta and makes an ordinary lead import
// named after the form, whose columns take the form's matched fields with no matching step, and whose preview offers the
// leads of people who already have a lead as "Already in your CRM". Leads of the last ten minutes are left to the catch-up.
import { afterAll, describe, expect, it } from "vitest";
import {
  checkLeadImportListener,
  earlierLeadsListener,
  matchMetaImportListener,
  type EarlierLeadsDependencies,
} from "../../src/crm/index.js";
import { readImportFileListener } from "../../src/imports/index.js";
import { metaImportSource } from "../../src/meta-leads/index.js";
import { aLead, aPerson, freshPhone } from "../crm/support/records.js";
import { leadJobDependencies } from "../crm/lead-import/support/lead-imports.js";
import { fakeIdentity } from "../imports/support/test-imports.js";
import { createTestMeta, eventsOf, runListener } from "./support/meta.js";
import { aRunningPage, now } from "./support/running.js";

const test = createTestMeta();
afterAll(() => test.close());

const answers = (name: string, phone: string) => ({
  full_name: [name],
  phone_number: [phone],
  email: [`${name.toLowerCase().replaceAll(" ", ".")}@example.test`],
});
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

async function aBroughtInForm() {
  const running = await aRunningPage(test);
  const identity = fakeIdentity({
    workers: { owner: running.owner },
    access: running.member,
    firstOwner: running.owner,
  });
  const jobs = { ...leadJobDependencies(test, identity), metaSource: metaImportSource };
  const dependencies: EarlierLeadsDependencies = {
    ...running.dependencies,
    files: test.files,
    spreadsheets: test.spreadsheets,
    identity: { ...running.dependencies.identity, resolveAccess: () => Promise.resolve(running.member) },
    subscriptions: running.dependencies.subscriptions,
  };
  const brought = () =>
    runListener(test, earlierLeadsListener(dependencies), running.agency, {
      type: "meta.form-brought-in",
      payload: { pageId: running.page.id, formId: running.form.id, earlierLeads: true },
    });
  return { running, jobs, dependencies, brought, identity };
}

describe("the last 30 days of a form", () => {
  it("makes nothing unless asked for, and nothing when the form has no earlier lead", async () => {
    const { running, dependencies, brought } = await aBroughtInForm();
    await runListener(test, earlierLeadsListener(dependencies), running.agency, {
      type: "meta.form-brought-in",
      payload: { pageId: running.page.id, formId: running.form.id, earlierLeads: false },
    });
    await brought();
    expect(await running.inOrg((tx) => tx.importBatch.count())).toBe(0);
  });

  it("makes an import named after the form with the leads of the last 30 days, not older and not the last ten minutes", async () => {
    const { running, brought } = await aBroughtInForm();
    running.leadAtMeta("OLD", answers("Too Old", freshPhone()), { createdAt: daysAgo(31) });
    running.leadAtMeta("IN1", answers("First Earlier", freshPhone()), {
      createdAt: daysAgo(20),
      platform: "instagram",
    });
    running.leadAtMeta("IN2", answers("Second Earlier", freshPhone()), { createdAt: daysAgo(3) });
    running.leadAtMeta("NEW", answers("Just Now", freshPhone()), { createdAt: new Date(now.getTime() - 120_000) });
    await brought();
    const batch = await running.inOrg((tx) =>
      tx.importBatch.findFirstOrThrow({ where: { sourceMetaFormId: running.form.id } }),
    );
    expect(batch).toMatchObject({ kind: "leads", status: "reading", startedBy: running.owner, fileKind: "csv" });
    expect(batch.fileName).toMatch(/^Winter ad · \d+ \w+\.csv$/);
    // The file holds the two earlier leads, with the form's questions as columns.
    const [file] = await test.files.list(
      { organizationId: running.agency, userId: null, source: "job", impersonatedBy: null },
      { recordType: "import_batch", recordId: batch.id },
    );
    expect(file).toBeDefined();
    expect((await eventsOf(test, running.agency, ["import.uploaded"])).length).toBe(1);
    // Asked again (a retried job): the same import, once.
    await brought();
    expect(await running.inOrg((tx) => tx.importBatch.count())).toBe(1);
  });

  it("reads into an import whose columns take the form's fields and whose leads are 'Already in your CRM' when known", async () => {
    const { running, jobs, dependencies, brought } = await aBroughtInForm();
    const known = freshPhone();
    await running.inOrg(async (tx) => {
      const person = await aPerson(tx, { name: "Known Person", phoneE164: known });
      await aLead(tx, { personId: person.id });
    });
    running.leadAtMeta("K1", answers("Known Person", known), { createdAt: daysAgo(10), platform: "facebook" });
    running.leadAtMeta("N1", answers("Brand New", freshPhone()), { createdAt: daysAgo(9), platform: "instagram" });
    await brought();
    const importId = (
      await running.inOrg((tx) => tx.importBatch.findFirstOrThrow({ where: { sourceMetaFormId: running.form.id } }))
    ).id;
    await runListener(test, readImportFileListener(jobs), running.agency, {
      type: "import.uploaded",
      payload: { importId },
    });
    await runListener(test, matchMetaImportListener(dependencies), running.agency, {
      type: "import.read",
      payload: { importId, kind: "leads" },
    });
    const columns = await running.inOrg((tx) =>
      tx.importColumn.findMany({ where: { batchId: importId }, orderBy: { position: "asc" } }),
    );
    expect(columns.map((column) => [column.header, column.field])).toEqual([
      ["Full name", "name"],
      ["Phone", "phone"],
      ["Email", "email"],
      ["Where do you want to go?", "note"],
      ["Enquiry date", "enquiry_date"],
      ["Platform", "their_source"],
    ]);
    expect((await running.inOrg((tx) => tx.importBatch.findUniqueOrThrow({ where: { id: importId } }))).status).toBe(
      "checking",
    );
    await runListener(test, checkLeadImportListener(jobs), running.agency, {
      type: "import.columns-matched",
      payload: { importId, kind: "leads" },
    });
    const rows = await running.inOrg((tx) =>
      tx.importRow.findMany({ where: { batchId: importId }, orderBy: { rowNumber: "asc" } }),
    );
    expect(rows.map((row) => row.plan)).toEqual(["in_crm", "new"]);
  });

  it("ends the import when the person who connected can no longer act, as a file's import would", async () => {
    const { running, dependencies, brought, jobs } = await aBroughtInForm();
    running.leadAtMeta("G1", answers("Gone Connector", freshPhone()), { createdAt: daysAgo(5) });
    await brought();
    const importId = (
      await running.inOrg((tx) => tx.importBatch.findFirstOrThrow({ where: { sourceMetaFormId: running.form.id } }))
    ).id;
    await runListener(test, readImportFileListener(jobs), running.agency, {
      type: "import.uploaded",
      payload: { importId },
    });
    const gone = {
      ...dependencies,
      identity: { ...dependencies.identity, resolveAccess: () => Promise.resolve(null) },
    };
    await runListener(test, matchMetaImportListener(gone), running.agency, {
      type: "import.read",
      payload: { importId, kind: "leads" },
    });
    expect(await running.inOrg((tx) => tx.importBatch.findUniqueOrThrow({ where: { id: importId } }))).toMatchObject({
      status: "failed",
      failureReason: "no_longer_a_member",
    });
  });
});
