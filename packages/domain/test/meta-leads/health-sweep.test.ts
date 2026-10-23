// The daily check of a Page (M3, spec 3.4): a token that stopped working makes the Page need reconnecting, once; one that
// ends within a week warns once; a lost subscription is made again; a form whose questions changed needs attention. And the
// sweep lets go of a draft left a day, deleting its token.
import { afterAll, describe, expect, it } from "vitest";
import {
  checkAllPages,
  checkPageHealth,
  questionsHashOf,
  routeListener,
  sweepMeta,
} from "../../src/meta-leads/index.js";
import {
  aForm,
  anAgency,
  aPage,
  createTestMeta,
  eventsOf,
  memberOf,
  runListener,
  winterQuestions,
} from "./support/meta.js";

const test = createTestMeta();
afterAll(() => test.close());
const now = new Date("2026-10-23T10:00:00Z");

async function aRunningPage() {
  const agency = await anAgency(test);
  const member = memberOf(agency);
  const page = await test.db.forOrg(agency, (tx) => aPage(test, tx, agency, { connectedBy: member.userId }));
  test.graph.addLogin(`l-${page.id}`, {
    userId: "u",
    pages: [{ id: page.metaPageId, name: "P", token: page.token, canAdvertise: true }],
  });
  await test.graph.subscribePage(page.metaPageId, page.token);
  return { agency, member, page };
}
const statusOf = (agency: string, id: string) =>
  test.db.forOrg(agency, async (tx) => (await tx.metaPage.findUniqueOrThrow({ where: { id } })).status);

describe("checkPageHealth", () => {
  it("leaves a healthy Page as it is", async () => {
    const { agency, page } = await aRunningPage();
    expect(await checkPageHealth(test.dependencies, page.id, agency, now)).toBe("ok");
    expect(await statusOf(agency, page.id)).toBe("running");
  });

  it("moves a Page whose token stopped working to needs_reconnect, and tells the Owner once", async () => {
    const { agency, page } = await aRunningPage();
    test.graph.expireToken(page.token);
    expect(await checkPageHealth(test.dependencies, page.id, agency, now)).toBe("needs_reconnect");
    expect(await statusOf(agency, page.id)).toBe("needs_reconnect");
    // The next day's check leaves a Page that already needs it alone.
    expect(await checkPageHealth(test.dependencies, page.id, agency, now)).toBe("skipped");
    expect((await eventsOf(test, agency, ["meta.attention"])).map(([, payload]) => payload)).toEqual([
      { pageId: page.id, kind: "needs_reconnect" },
    ]);
  });

  it("subscribes again when Meta no longer lists our app", async () => {
    const { agency, page } = await aRunningPage();
    await test.graph.unsubscribePage(page.metaPageId, page.token);
    await checkPageHealth(test.dependencies, page.id, agency, now);
    expect(test.graph.subscribedPages.has(page.metaPageId)).toBe(true);
  });

  it("does not check a paused Page", async () => {
    const { agency, page } = await aRunningPage();
    await test.db.forOrg(agency, (tx) => tx.metaPage.update({ where: { id: page.id }, data: { status: "paused" } }));
    test.graph.expireToken(page.token);
    expect(await checkPageHealth(test.dependencies, page.id, agency, now)).toBe("skipped");
    expect(await statusOf(agency, page.id)).toBe("paused");
  });

  it("marks a Page whose token cannot be opened as needing a reconnect", async () => {
    const { agency, page } = await aRunningPage();
    await test.db.forOrg(agency, (tx) => tx.metaPage.update({ where: { id: page.id }, data: { tokenKeyVersion: 1 } }));
    expect(await checkPageHealth(test.dependencies, page.id, agency, now)).toBe("needs_reconnect");
  });

  it("asks for the Owner's warning once, when the token's end first falls within seven days", async () => {
    const { agency, page } = await aRunningPage();
    const spy = test.graph.inspectToken.bind(test.graph);
    const ends = new Date(now.getTime() + 3 * 86_400_000);
    test.graph.inspectToken = async (token) => ({ ...(await spy(token)), expiresAt: ends });
    await checkPageHealth(test.dependencies, page.id, agency, now);
    await checkPageHealth(test.dependencies, page.id, agency, new Date(now.getTime() + 86_400_000));
    const warnings = (await eventsOf(test, agency, ["meta.attention"])).filter(
      ([, payload]) => (payload as { kind: string }).kind === "token_expiring",
    );
    expect(warnings).toHaveLength(1);
    expect(
      (await test.db.forOrg(agency, (tx) => tx.metaPage.findUniqueOrThrow({ where: { id: page.id } }))).tokenExpiresAt,
    ).toEqual(ends);
    test.graph.inspectToken = spy;
  });

  it("raises Needs attention on a brought-in form whose questions changed, once", async () => {
    const { agency, page } = await aRunningPage();
    const formId = `F-${page.id}`;
    test.graph.addForm(page.metaPageId, { id: formId, name: "Winter ad", questions: winterQuestions });
    const form = await test.db.forOrg(agency, async (tx) => {
      const made = await aForm(tx, page.id, { formId });
      await tx.metaForm.update({ where: { id: made.id }, data: { questionsHash: questionsHashOf(winterQuestions) } });
      return made;
    });
    await checkPageHealth(test.dependencies, page.id, agency, now);
    expect(
      (await test.db.forOrg(agency, (tx) => tx.metaForm.findUniqueOrThrow({ where: { id: form.id } }))).state,
    ).toBe("running");
    test.graph.setQuestions(formId, [...winterQuestions, { key: "extra", type: "custom", label: "Extra?" }]);
    await checkPageHealth(test.dependencies, page.id, agency, now);
    await checkPageHealth(test.dependencies, page.id, agency, now);
    expect(
      (await test.db.forOrg(agency, (tx) => tx.metaForm.findUniqueOrThrow({ where: { id: form.id } }))).state,
    ).toBe("needs_attention");
    const changes = (await eventsOf(test, agency, ["meta.attention"])).filter(
      ([, payload]) => (payload as { kind: string }).kind === "form_changed",
    );
    expect(changes).toHaveLength(1);
  });
});

describe("checkAllPages", () => {
  it("walks the routed Pages, counting the outcomes and surviving one that fails", async () => {
    const healthy = await aRunningPage();
    const broken = await aRunningPage();
    for (const { agency, page } of [healthy, broken]) {
      await runListener(test, routeListener({ db: test.db, logger: test.logger }), agency, {
        type: "meta.page-changed",
        payload: { pageId: page.id },
      });
    }
    test.graph.expireToken(broken.page.token);
    const counts = await checkAllPages(test.dependencies, now);
    expect(counts.needs_reconnect).toBeGreaterThanOrEqual(1);
    expect(await statusOf(healthy.agency, healthy.page.id)).toBe("running");
    expect(await statusOf(broken.agency, broken.page.id)).toBe("needs_reconnect");
  });
});

describe("sweepMeta", () => {
  it("lets go of a draft left a day, with its token, and leaves a fresh draft and a running Page", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    const { old, fresh, running } = await test.db.forOrg(agency, async (tx) => ({
      old: await aPage(test, tx, agency, { connectedBy: member.userId, status: "connecting" }),
      fresh: await aPage(test, tx, agency, { connectedBy: member.userId, status: "connecting" }),
      running: await aPage(test, tx, agency, { connectedBy: member.userId }),
    }));
    await test.db.forOrg(agency, (tx) =>
      tx.metaPage.update({ where: { id: old.id }, data: { createdAt: new Date(now.getTime() - 25 * 3_600_000) } }),
    );
    await test.db.forOrg(agency, (tx) => tx.metaPage.update({ where: { id: fresh.id }, data: { createdAt: now } }));
    const swept = await test.platform.$transaction((tx) => sweepMeta(tx, now, 100));
    expect(swept.draftsLetGo).toBeGreaterThanOrEqual(1);
    const rows = await test.db.forOrg(agency, (tx) => tx.metaPage.findMany());
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    expect(byId[old.id]).toMatchObject({ status: "disconnected", tokenCiphertext: null });
    expect(byId[fresh.id]?.status).toBe("connecting");
    expect(byId[running.id]?.status).toBe("running");
  });
});
