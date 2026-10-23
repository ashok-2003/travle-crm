// The catch-up (M15-M17): a lead made at Meta with no webhook arrives on the next tick and the cursor moves; the overlap
// re-reads and saves nothing twice; a crash between the read and the save leaves the lead pending and the next tick finishes
// it; more than five leads send one summary, not a notice each; a paused Page, a token that fails and a rate limit each
// stop it the right way; an erased Meta lead never comes back; the dispatcher and the job carry ids only.
import { afterAll, describe, expect, it } from "vitest";
import { catchUpPage, metaCatchupHandler } from "../../src/crm/index.js";
import {
  callGraph,
  dispatchDueCatchups,
  META_CATCHUP_QUEUE,
  makeCatchupDue,
  routeRowOf,
  withdrawMetaLeads,
} from "../../src/meta-leads/index.js";
import { freshPhone } from "../crm/support/records.js";
import { createTestMeta, eventsOf } from "./support/meta.js";
import { aRunningPage, now } from "./support/running.js";

const test = createTestMeta();
afterAll(() => test.close());

const answers = (name: string, phone: string) => ({
  full_name: [name],
  phone_number: [phone],
  email: [`${name.toLowerCase().replaceAll(" ", ".")}@example.test`],
});
const cursorOf = async (running: Awaited<ReturnType<typeof aRunningPage>>) =>
  (await running.inOrg((tx) => tx.metaForm.findUniqueOrThrow({ where: { id: running.form.id } }))).catchupCursor;
const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);
const catchUp = (running: Awaited<ReturnType<typeof aRunningPage>>, when = now) =>
  catchUpPage(running.dependencies, running.agency, running.page.metaPageId, when);

describe("catchUpPage", () => {
  it("brings in a lead made with no webhook, moves the cursor, and adds nothing on the second tick", async () => {
    const running = await aRunningPage(test);
    const before = await cursorOf(running);
    running.leadAtMeta("C1", answers("Missed Person", freshPhone()), { createdAt: at(5) });
    const first = await catchUp(running);
    expect(first).toMatchObject({ keepRoute: true, added: 1 });
    expect(await running.leads()).toHaveLength(1);
    const cursor = await cursorOf(running);
    expect(cursor).toBe(BigInt(Math.floor(at(5).getTime() / 1000)));
    expect(cursor).toBeGreaterThan(before ?? 0n);
    const second = await catchUp(running, new Date(now.getTime() + 1_800_000));
    expect(second.added).toBe(0);
    expect(await running.leads()).toHaveLength(1);
    expect(
      (await running.inOrg((tx) => tx.metaPage.findUniqueOrThrow({ where: { id: running.page.id } }))).lastOkAt,
    ).not.toBeNull();
  });

  it("re-reads the overlap and saves nothing twice, and a lead the webhook already saved is not saved again", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("O1", answers("Webhook Person", freshPhone()), { createdAt: at(5) });
    expect(await running.deliver("O1")).toBe("added");
    running.leadAtMeta("O2", answers("Overlap Person", freshPhone()), { createdAt: at(4) });
    const result = await catchUp(running);
    expect(result.added).toBe(1);
    expect(await running.leads()).toHaveLength(2);
    // Meta's list still holds both inside the ten-minute overlap; nothing is added by reading them again.
    expect((await catchUp(running)).added).toBe(0);
    expect(await running.inOrg((tx) => tx.metaLead.count())).toBe(2);
  });

  it("stops a form at a lead it cannot save, leaves the cursor behind it, and saves them all next tick", async () => {
    const running = await aRunningPage(test);
    for (const [index, name] of ["First Person", "Second Person", "Third Person"].entries()) {
      running.leadAtMeta(`F${String(index)}`, answers(name, freshPhone()), { createdAt: at(6 - index) });
    }
    const cursorBefore = await cursorOf(running);
    // An agency whose time zone cannot be read: every save fails before it writes.
    const broken = {
      ...running.dependencies,
      identity: {
        ...running.dependencies.identity,
        organizationProfile: () => Promise.resolve({ timeZone: "Not/AZone" } as never),
      },
    };
    const failed = await catchUpPage(broken, running.agency, running.page.metaPageId, now);
    expect(failed).toMatchObject({ added: 0, keepRoute: true });
    expect(await running.leads()).toHaveLength(0);
    expect(await cursorOf(running)).toBe(cursorBefore);
    expect(JSON.stringify(test.logger.entries)).not.toContain("Person");
    expect(
      (await running.inOrg((tx) => tx.metaPage.findUniqueOrThrow({ where: { id: running.page.id } })))
        .consecutiveFailures,
    ).toBe(1);
    expect((await catchUp(running)).added).toBe(3);
  });

  it("retries a ledger row left pending for over five minutes", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("PD", answers("Pending Person", freshPhone()), { createdAt: at(30) });
    await running.inOrg((tx) =>
      tx.metaLead.create({
        data: { metaLeadId: "PD", formId: running.form.formId, status: "pending", firstSeenAt: at(20) },
      }),
    );
    // The cursor is past it, so only the retry of pending rows can find it.
    await running.inOrg((tx) =>
      tx.metaForm.update({
        where: { id: running.form.id },
        data: { catchupCursor: BigInt(Math.floor(now.getTime() / 1000)) },
      }),
    );
    const result = await catchUp(running);
    expect(result.added).toBe(1);
    expect((await running.inOrg((tx) => tx.metaLead.findFirstOrThrow({ where: { metaLeadId: "PD" } }))).status).toBe(
      "added",
    );
  });

  it("sends one summary to the owner, not a notice for each, when it adds more than five", async () => {
    const running = await aRunningPage(test);
    for (let n = 0; n < 7; n += 1)
      running.leadAtMeta(`S${String(n)}`, answers(`Summary Person ${String(n)}`, freshPhone()), {
        createdAt: at(30 - n),
      });
    const result = await catchUp(running);
    expect(result.added).toBe(7);
    const notices = await running.inOrg((tx) =>
      tx.notification.findMany({ where: { recipientUserId: running.owner } }),
    );
    expect(notices.filter((notice) => notice.kind === "lead.meta-added")).toHaveLength(1);
    expect(notices.filter((notice) => notice.kind === "lead.assigned")).toHaveLength(0);
    expect(notices.find((notice) => notice.kind === "lead.meta-added")?.title).toContain("7 new leads");
  });

  it("tells the owner of each lead as usual when it adds five or fewer", async () => {
    const running = await aRunningPage(test);
    for (let n = 0; n < 3; n += 1)
      running.leadAtMeta(`U${String(n)}`, answers(`Usual Person ${String(n)}`, freshPhone()), {
        createdAt: at(30 - n),
      });
    await catchUp(running);
    const notices = await running.inOrg((tx) =>
      tx.notification.findMany({ where: { recipientUserId: running.owner } }),
    );
    expect(notices.filter((notice) => notice.kind === "lead.meta-added")).toHaveLength(0);
  });

  it("reads nothing from a paused Page or one that needs a reconnect, and keeps its route", async () => {
    for (const status of ["paused", "needs_reconnect"]) {
      const running = await aRunningPage(test, { page: { status } });
      running.leadAtMeta("Z", answers("Waiting Person", freshPhone()), { createdAt: at(5) });
      const before = test.graph.calls.total;
      expect(await catchUp(running), status).toMatchObject({ keepRoute: true, added: 0 });
      expect(test.graph.calls.total).toBe(before);
    }
  });

  it("removes the route of a Page that is gone", async () => {
    const running = await aRunningPage(test, { page: { status: "disconnected" } });
    expect((await catchUp(running)).keepRoute).toBe(false);
  });

  it("moves the Page to needs_reconnect when its token fails, once, and the leads wait for the reconnect", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("K", answers("Token Wait", freshPhone()), { createdAt: at(5) });
    test.graph.expireToken(running.page.token);
    await catchUp(running);
    expect(
      (await running.inOrg((tx) => tx.metaPage.findUniqueOrThrow({ where: { id: running.page.id } }))).status,
    ).toBe("needs_reconnect");
    await catchUp(running);
    expect((await eventsOf(test, running.agency, ["meta.attention"])).length).toBe(1);
    // After the reconnect the lead made meanwhile arrives.
    test.graph.restoreToken(running.page.token);
    await running.inOrg((tx) => tx.metaPage.update({ where: { id: running.page.id }, data: { status: "running" } }));
    expect((await catchUp(running)).added).toBe(1);
  });

  it("backs off on a rate limit without failing the Page or moving the cursor", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("RL", answers("Limit Wait", freshPhone()), { createdAt: at(5) });
    test.graph.failNext("rate_limited", { pageId: running.page.metaPageId, code: 80005 });
    const before = await cursorOf(running);
    const result = await catchUp(running);
    expect(result).toMatchObject({ keepRoute: true, added: 0 });
    expect(await cursorOf(running)).toBe(before);
    const page = await running.inOrg((tx) => tx.metaPage.findUniqueOrThrow({ where: { id: running.page.id } }));
    expect(page).toMatchObject({ status: "running", consecutiveFailures: 0 });
    expect((await catchUp(running)).added).toBe(1);
  });

  it("counts failures and makes the Page amber after three in a row, clearing it on a clean tick", async () => {
    const running = await aRunningPage(test);
    for (let n = 0; n < 3; n += 1) {
      test.graph.failNext("unavailable", { pageId: running.page.metaPageId });
      await catchUp(running);
    }
    const sick = await running.inOrg((tx) => tx.metaPage.findUniqueOrThrow({ where: { id: running.page.id } }));
    expect(sick).toMatchObject({ consecutiveFailures: 3 });
    expect(sick.attentionSince).not.toBeNull();
    await catchUp(running);
    expect(
      await running.inOrg((tx) => tx.metaPage.findUniqueOrThrow({ where: { id: running.page.id } })),
    ).toMatchObject({ consecutiveFailures: 0, attentionSince: null });
  });

  it("stops at the Graph budget as a back-off", async () => {
    const running = await aRunningPage(test, { budget: { perHour: 1, catchupPerHour: 1 } });
    running.leadAtMeta("BG", answers("Budget Wait", freshPhone()), { createdAt: at(5) });
    // The webhook path has spent the hour's one call.
    await callGraph(running.dependencies, running.agency, "webhook", () => Promise.resolve(null));
    expect(await catchUp(running)).toMatchObject({ added: 0, keepRoute: true });
    expect(await running.leads()).toHaveLength(0);
  });

  it("reads only forms that are brought in, and never a lead the ledger holds as erased", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("E1", answers("Erased Person", freshPhone()), { createdAt: at(5) });
    expect((await catchUp(running)).added).toBe(1);
    const person = (await running.leads())[0]?.personId ?? "";
    await running.inOrg((tx) => withdrawMetaLeads(tx, { organizationId: running.agency, personId: person }));
    await running.inOrg((tx) => tx.metaForm.update({ where: { id: running.form.id }, data: { catchupCursor: 0n } }));
    expect((await catchUp(running)).added).toBe(0);
    expect(await running.inOrg((tx) => tx.metaLead.count({ where: { status: "erased" } }))).toBe(1);
    // A form not brought in is not read at all.
    await running.inOrg((tx) =>
      tx.metaForm.update({ where: { id: running.form.id }, data: { state: "not_brought_in" } }),
    );
    const calls = test.graph.calls.byMethod.listLeads ?? 0;
    await catchUp(running);
    expect(test.graph.calls.byMethod.listLeads ?? 0).toBe(calls);
  });
});

describe("a lead the first fetch lost", () => {
  it("is read again from the list within a day, so a lead Meta refused for a moment is not lost", async () => {
    const running = await aRunningPage(test);
    // The webhook found nothing (Meta answered 100 before the lead was readable): written down as gone.
    expect(await running.deliver("LATE")).toBe("lead_gone");
    expect(await running.leads()).toHaveLength(0);
    running.leadAtMeta("LATE", answers("Late Lead", freshPhone()), { createdAt: at(1) });
    const result = await catchUp(running);
    expect(result.added).toBe(1);
    expect((await running.inOrg((tx) => tx.metaLead.findFirstOrThrow({ where: { metaLeadId: "LATE" } }))).status).toBe(
      "added",
    );
  });

  it("leaves a lead written down as gone for over a day, and any other problem, to a person's Check again", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("OLDGONE", answers("Old Gone", freshPhone()), { createdAt: at(1) });
    running.leadAtMeta("NOCONTACT", { full_name: ["No Contact"] }, { createdAt: at(1) });
    await running.inOrg(async (tx) => {
      await tx.metaLead.create({
        data: {
          metaLeadId: "OLDGONE",
          formId: running.form.formId,
          status: "not_added",
          reasons: ["lead_not_found"],
          firstSeenAt: new Date(Date.now() - 2 * 86_400_000),
        },
      });
      await tx.metaLead.create({
        data: {
          metaLeadId: "NOCONTACT",
          formId: running.form.formId,
          status: "not_added",
          reasons: ["no_contact"],
          firstSeenAt: new Date(),
        },
      });
    });
    expect((await catchUp(running)).added).toBe(0);
  });
});

describe("the catch-up job and its dispatcher", () => {
  it("queues the due Pages with ids only, holds them, and the job sets the next time and releases the claim", async () => {
    const running = await aRunningPage(test);
    const sent: { queue: string; data: Record<string, unknown> }[] = [];
    const queue = {
      send: (name: string, data: Record<string, unknown>) => {
        sent.push({ queue: name, data });
        return Promise.resolve(null);
      },
    } as never;
    await makeCatchupDue(test.db, {
      metaPageId: running.page.metaPageId,
      organizationId: running.agency,
      now: new Date("2000-01-01T00:00:00Z"),
    });
    const dispatched = await dispatchDueCatchups({ db: test.db, queue }, new Date());
    expect(dispatched.queued).toBeGreaterThanOrEqual(1);
    const mine = sent.find((job) => job.data.metaPageId === running.page.metaPageId);
    expect(mine).toEqual({
      queue: META_CATCHUP_QUEUE,
      data: { metaPageId: running.page.metaPageId, organizationId: running.agency },
    });
    expect((await routeRowOf(test.db, running.page.metaPageId))?.claimedUntil).not.toBeNull();
    running.leadAtMeta("J1", answers("Job Person", freshPhone()), { createdAt: new Date(Date.now() - 300_000) });
    const handler = metaCatchupHandler(running.dependencies);
    expect(handler.queue).toBe(META_CATCHUP_QUEUE);
    const before = Date.now();
    await handler.handle(mine?.data as never);
    expect(await running.leads()).toHaveLength(1);
    const route = await routeRowOf(test.db, running.page.metaPageId);
    expect(route?.claimedUntil).toBeNull();
    expect(route?.nextCatchupAt.getTime()).toBeGreaterThanOrEqual(before + 1_790_000);
  });

  it("removes the route of a Page that was disconnected, and refuses data that is not ids", async () => {
    const running = await aRunningPage(test);
    await running.inOrg((tx) =>
      tx.metaPage.update({ where: { id: running.page.id }, data: { status: "disconnected" } }),
    );
    const handler = metaCatchupHandler(running.dependencies);
    await handler.handle({ metaPageId: running.page.metaPageId, organizationId: running.agency });
    expect(await routeRowOf(test.db, running.page.metaPageId)).toBeNull();
    await expect(handler.handle({ metaPageId: "../me", organizationId: running.agency })).rejects.toThrow(
      "needs a metaPageId",
    );
    await expect(handler.handle({ metaPageId: "123", organizationId: "nope" })).rejects.toThrow("needs a metaPageId");
  });
});
