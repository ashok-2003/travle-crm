// The ledger converges deliveries on one row per Meta lead id and holds no answer; the views show the badges, the
// counts and the problems without a token; hiding a problem empties its example.
import { afterAll, describe, expect, it } from "vitest";
import {
  badgeOf,
  claimLedger,
  hideProblem,
  isSettled,
  listPages,
  metaProblems,
  pageDetailOf,
  stalePending,
  writeOutcome,
} from "../../src/meta-leads/index.js";
import { aForm, anAgency, aPage, auditOf, createTestMeta, memberOf } from "./support/meta.js";

const test = createTestMeta();
afterAll(() => test.close());
const now = new Date("2026-10-23T10:00:00Z");

describe("the ledger", () => {
  it("makes one pending row for a Meta lead id however often it is claimed, and settles it", async () => {
    const agency = await anAgency(test);
    await test.db.forOrg(agency, async (tx) => {
      const first = await claimLedger(tx, { metaLeadId: "ML1", formId: "F1", now });
      const again = await claimLedger(tx, { metaLeadId: "ML1", formId: "F1", now });
      expect(again.id).toBe(first.id);
      expect(first.status).toBe("pending");
      expect(isSettled(first)).toBe(false);
      await writeOutcome(
        tx,
        first,
        {
          status: "added",
          leadId: "0199e7a0-0000-7000-8000-0000000000a1",
          personId: "0199e7a0-0000-7000-8000-0000000000a2",
        },
        { createdAtMeta: now, platform: "instagram", now },
      );
      const settled = await claimLedger(tx, { metaLeadId: "ML1", formId: "F1", now });
      expect(settled).toMatchObject({ status: "added", platform: "instagram" });
      expect(isSettled(settled)).toBe(true);
    });
  });

  it("is the agency's own: another agency may hold the same Meta lead id", async () => {
    const one = await anAgency(test);
    const two = await anAgency(test);
    await test.db.forOrg(one, (tx) => claimLedger(tx, { metaLeadId: "SHARED", formId: "F", now }));
    const other = await test.db.forOrg(two, (tx) => claimLedger(tx, { metaLeadId: "SHARED", formId: "F", now }));
    expect(other.status).toBe("pending");
  });

  it("finds rows left pending for over five minutes, oldest first", async () => {
    const agency = await anAgency(test);
    await test.db.forOrg(agency, async (tx) => {
      await claimLedger(tx, { metaLeadId: "OLD", formId: "F", now: new Date(now.getTime() - 600_000) });
      await claimLedger(tx, { metaLeadId: "FRESH", formId: "F", now });
      const stale = await stalePending(tx, new Date(now.getTime() - 300_000), 10);
      expect(stale.map((row) => row.metaLeadId)).toEqual(["OLD"]);
    });
  });

  it("keeps a problem's reasons and a short example, clearing them when it later succeeds", async () => {
    const agency = await anAgency(test);
    await test.db.forOrg(agency, async (tx) => {
      const row = await claimLedger(tx, { metaLeadId: "BAD", formId: "F", now });
      await writeOutcome(
        tx,
        row,
        { status: "not_added", reasons: ["phone_invalid"], exampleName: "Asha ".repeat(60) },
        { createdAtMeta: now, platform: "facebook", now },
      );
      const bad = await claimLedger(tx, { metaLeadId: "BAD", formId: "F", now });
      expect(bad).toMatchObject({ status: "not_added", reasons: ["phone_invalid"] });
      expect(bad.exampleName?.length).toBeLessThanOrEqual(120);
      await writeOutcome(
        tx,
        row,
        {
          status: "added",
          leadId: "0199e7a0-0000-7000-8000-0000000000a1",
          personId: "0199e7a0-0000-7000-8000-0000000000a2",
        },
        { createdAtMeta: now, platform: "facebook", now },
      );
      expect(await claimLedger(tx, { metaLeadId: "BAD", formId: "F", now })).toMatchObject({
        status: "added",
        reasons: [],
        exampleName: null,
      });
    });
  });
});

describe("badgeOf", () => {
  it("says Needs reconnecting, Paused, Needs attention or Running", () => {
    expect(badgeOf({ status: "needs_reconnect", attentionSince: now }, false)).toBe("needs_reconnect");
    expect(badgeOf({ status: "paused", attentionSince: null }, true)).toBe("paused");
    expect(badgeOf({ status: "running", attentionSince: null }, true)).toBe("needs_attention");
    expect(badgeOf({ status: "running", attentionSince: now }, false)).toBe("needs_attention");
    expect(badgeOf({ status: "running", attentionSince: null }, false)).toBe("running");
  });
});

describe("the page list and detail", () => {
  it("lists live Pages with the forms brought in and the badge, and no draft or disconnected Page", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    await test.db.forOrg(agency, async (tx) => {
      const running = await aPage(test, tx, agency, { connectedBy: member.userId, pageName: "Running" });
      const amber = await aPage(test, tx, agency, { connectedBy: member.userId, pageName: "Amber" });
      await aPage(test, tx, agency, { connectedBy: member.userId, pageName: "Draft", status: "connecting" });
      await aPage(test, tx, agency, { connectedBy: member.userId, pageName: "Gone", status: "disconnected" });
      await aForm(tx, running.id);
      await aForm(tx, running.id, { state: "not_brought_in" });
      await aForm(tx, amber.id, { state: "needs_attention" });
    });
    const list = await test.db.forOrg(agency, (tx) => listPages(tx, { configured: true, demo: false }));
    expect(list.limit).toBe(5);
    expect(list.items.map((item) => [item.pageName, item.badge, item.formsBroughtIn]).sort()).toEqual([
      ["Amber", "needs_attention", 1],
      ["Running", "running", 1],
    ]);
  });

  it("shows a Page's counts and the leads that couldn't be added, and no token", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    const { page } = await test.db.forOrg(agency, async (tx) => {
      const page = await aPage(test, tx, agency, {
        connectedBy: member.userId,
        leadsAdded: 3,
        lastCheckedAt: new Date(now.getTime() - 2 * 3600_000),
      });
      const form = await aForm(tx, page.id, { formName: "Rajasthan winter ad" });
      await tx.metaLead.create({
        data: {
          metaLeadId: "P1",
          formId: form.formId,
          status: "not_added",
          reasons: ["no_contact"],
          exampleName: "Asha",
          platform: "instagram",
        },
      });
      await tx.metaLead.create({
        data: { metaLeadId: "P2", formId: form.formId, status: "not_added", reasons: ["no_name"], resolvedAt: now },
      });
      await tx.metaLead.create({ data: { metaLeadId: "OK", formId: form.formId, status: "added" } });
      return { page };
    });
    const detail = await test.db.forOrg(agency, (tx) => pageDetailOf(tx, page.id, { readOnly: false, now }));
    expect(detail).toMatchObject({
      pageName: "Yatra Hikes",
      late: true,
      connectedByUserId: member.userId,
      counts: { added: 3, couldntBeAdded: 1 },
    });
    expect(JSON.stringify(detail)).not.toMatch(/ciphertext|nonce|tokenKey|tokenKind/i);
    const problems = await test.db.forOrg(agency, (tx) => metaProblems(tx, page.id, { limit: 50 }));
    expect(problems.items).toHaveLength(1);
    expect(problems.items[0]).toMatchObject({
      formName: "Rajasthan winter ad",
      reasons: ["no_contact"],
      exampleName: "Asha",
      platform: "instagram",
    });
    expect(problems.next).toBeNull();
  });

  it("pages the problems and hides one, emptying its example and auditing it", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    const { page } = await test.db.forOrg(agency, async (tx) => {
      const page = await aPage(test, tx, agency, { connectedBy: member.userId });
      const form = await aForm(tx, page.id);
      for (const id of ["A", "B", "C"]) {
        await tx.metaLead.create({
          data: { metaLeadId: id, formId: form.formId, status: "not_added", reasons: ["no_name"], exampleName: id },
        });
      }
      return { page };
    });
    const first = await test.db.forOrg(agency, (tx) => metaProblems(tx, page.id, { limit: 2 }));
    expect(first.items).toHaveLength(2);
    const second = await test.db.forOrg(agency, (tx) =>
      metaProblems(tx, page.id, { limit: 2, after: first.next ?? "" }),
    );
    expect(second.items).toHaveLength(1);
    await test.db.forOrg(agency, (tx) => hideProblem(tx, member, page.id, first.items[0]?.id ?? "", now));
    const rows = await test.db.forOrg(agency, (tx) =>
      tx.metaLead.findMany({ where: { id: first.items[0]?.id ?? "" } }),
    );
    expect(rows[0]).toMatchObject({ exampleName: null });
    expect(rows[0]?.resolvedAt).not.toBeNull();
    expect((await test.db.forOrg(agency, (tx) => metaProblems(tx, page.id, { limit: 10 }))).items).toHaveLength(2);
    expect((await auditOf(test, agency, page.id)).map((entry) => entry.action)).toEqual(["meta.problem-hidden"]);
  });
});
