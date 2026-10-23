// What the people who manage a Page can do (spec 3.3, 4.6): pause and resume, Check now with its cooldown, and Disconnect,
// which deletes the token and the route but keeps the forms, matches and ledger, so connecting again resumes.
import { afterAll, describe, expect, it } from "vitest";
import { DomainError } from "../../src/kernel/index.js";
import { disconnectPage, pausePage, requestCheckNow, resumePage } from "../../src/meta-leads/index.js";
import { aForm, anAgency, aPage, auditOf, createTestMeta, eventsOf, memberOf } from "./support/meta.js";

const test = createTestMeta();
afterAll(() => test.close());
const now = new Date("2026-10-23T10:00:00Z");

const reasonOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  return (error as DomainError).reason;
};

async function aRunningPage(status = "running") {
  const agency = await anAgency(test);
  const member = memberOf(agency);
  const page = await test.db.forOrg(agency, (tx) => aPage(test, tx, agency, { connectedBy: member.userId, status }));
  return { agency, member, page };
}

describe("pause and resume", () => {
  it("pauses a running Page, audits it, asks for its route to be kept, and resumes it with a check", async () => {
    const { agency, member, page } = await aRunningPage();
    await test.db.forOrg(agency, (tx) => pausePage(tx, member, page.id));
    expect(
      (await test.db.forOrg(agency, (tx) => tx.metaPage.findUniqueOrThrow({ where: { id: page.id } }))).status,
    ).toBe("paused");
    await test.db.forOrg(agency, (tx) => pausePage(tx, member, page.id));
    await test.db.forOrg(agency, (tx) => resumePage(tx, member, page.id));
    expect(
      (await test.db.forOrg(agency, (tx) => tx.metaPage.findUniqueOrThrow({ where: { id: page.id } }))).status,
    ).toBe("running");
    expect((await auditOf(test, agency, page.id)).map((entry) => entry.action)).toEqual([
      "meta.page-paused",
      "meta.page-resumed",
    ]);
    expect((await eventsOf(test, agency, ["meta.check-requested"])).length).toBe(1);
  });

  it("refuses to resume what is not paused, and does not know a disconnected Page", async () => {
    const { agency, member, page } = await aRunningPage();
    expect(await reasonOf(test.db.forOrg(agency, (tx) => resumePage(tx, member, page.id)))).toBe("META_PAGE_NOT_READY");
    const gone = await aRunningPage("disconnected");
    expect(await reasonOf(test.db.forOrg(gone.agency, (tx) => pausePage(tx, gone.member, gone.page.id)))).toBe(
      "NOT_FOUND",
    );
  });

  it("does not let another agency's member reach the Page", async () => {
    const { page } = await aRunningPage();
    const other = await anAgency(test);
    expect(await reasonOf(test.db.forOrg(other, (tx) => pausePage(tx, memberOf(other), page.id)))).toBe("NOT_FOUND");
  });
});

describe("Check now", () => {
  it("asks for a check, but not within 30 seconds of the last one", async () => {
    const { agency, page } = await aRunningPage();
    await test.db.forOrg(agency, (tx) => requestCheckNow(tx, page.id, now));
    expect((await eventsOf(test, agency, ["meta.check-requested"])).length).toBe(1);
    await test.db.forOrg(agency, (tx) =>
      tx.metaPage.update({ where: { id: page.id }, data: { lastCheckedAt: new Date(now.getTime() - 10_000) } }),
    );
    expect(await reasonOf(test.db.forOrg(agency, (tx) => requestCheckNow(tx, page.id, now)))).toBe("META_BUSY");
    await test.db.forOrg(agency, (tx) =>
      tx.metaPage.update({ where: { id: page.id }, data: { lastCheckedAt: new Date(now.getTime() - 60_000) } }),
    );
    await expect(test.db.forOrg(agency, (tx) => requestCheckNow(tx, page.id, now))).resolves.toBeUndefined();
  });

  it("is for a running Page only", async () => {
    const { agency, page } = await aRunningPage("paused");
    expect(await reasonOf(test.db.forOrg(agency, (tx) => requestCheckNow(tx, page.id, now)))).toBe(
      "META_PAGE_NOT_READY",
    );
  });
});

describe("disconnectPage", () => {
  it("tells Meta to stop, deletes the token, keeps the forms and ledger, audits it, and drops the route", async () => {
    const { agency, member, page } = await aRunningPage();
    test.graph.addLogin("d1", {
      userId: "u",
      pages: [{ id: page.metaPageId, name: "P", token: page.token, canAdvertise: true }],
    });
    await test.graph.subscribePage(page.metaPageId, page.token);
    const form = await test.db.forOrg(agency, async (tx) => {
      const made = await aForm(tx, page.id);
      await tx.metaLead.create({ data: { metaLeadId: "ML1", formId: made.formId, status: "added" } });
      return made;
    });
    await disconnectPage(test.dependencies, member, page.id, now);
    expect(test.graph.subscribedPages.has(page.metaPageId)).toBe(false);
    const row = await test.db.forOrg(agency, (tx) => tx.metaPage.findUniqueOrThrow({ where: { id: page.id } }));
    expect(row).toMatchObject({
      status: "disconnected",
      tokenCiphertext: null,
      tokenNonce: null,
      tokenKeyVersion: null,
    });
    expect(await test.db.forOrg(agency, (tx) => tx.metaForm.count({ where: { id: form.id } }))).toBe(1);
    expect(await test.db.forOrg(agency, (tx) => tx.metaLead.count())).toBe(1);
    expect((await auditOf(test, agency, page.id)).map((entry) => entry.action)).toEqual(["meta.page-disconnected"]);
    expect((await eventsOf(test, agency, ["meta.page-changed"])).length).toBe(1);
  });

  it("disconnects even when Meta does not answer, and logs only the reason", async () => {
    const { agency, member, page } = await aRunningPage();
    test.graph.addLogin("d2", {
      userId: "u",
      pages: [{ id: page.metaPageId, name: "P", token: page.token, canAdvertise: true }],
    });
    test.graph.throwNext(new Error(`GET https://graph.facebook.com/x?access_token=${page.token} failed`));
    await disconnectPage(test.dependencies, member, page.id, now);
    expect(
      (await test.db.forOrg(agency, (tx) => tx.metaPage.findUniqueOrThrow({ where: { id: page.id } }))).status,
    ).toBe("disconnected");
    expect(JSON.stringify(test.logger.entries)).not.toContain(page.token);
  });
});
