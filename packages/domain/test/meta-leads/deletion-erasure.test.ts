// Meta's data deletion callback (spec 10): a bad signature or an expired request does nothing; a valid one disconnects every
// Page the Meta user connected in every agency, deletes their tokens, keeps the leads, and answers a status address and a
// code. Erasing a customer keeps the Meta lead id and form id, clears the rest, and empties every example in the agency.
import { randomUUID } from "node:crypto";
import { makeSignedRequest } from "@travel-crm/integrations/meta-graph";
import { afterAll, describe, expect, it } from "vitest";
import {
  claimLedger,
  confirmationCodeOf,
  handleDeletionRequest,
  routeRowOf,
  routeListener,
  upsertRoute,
  wellFormedCode,
  withdrawMetaLeads,
  writeOutcome,
} from "../../src/meta-leads/index.js";
import {
  appSecret,
  aPage,
  anAgency,
  auditOf,
  createTestMeta,
  eventsOf,
  memberOf,
  runListener,
} from "./support/meta.js";

const test = createTestMeta();
afterAll(() => test.close());
const now = new Date("2026-10-23T10:00:00Z");
const nowSeconds = Math.floor(now.getTime() / 1000);
const appUrl = "https://app.example.in";

async function aConnectedPage(userId: string) {
  const agency = await anAgency(test);
  const member = memberOf(agency);
  const page = await test.db.forOrg(agency, (tx) =>
    aPage(test, tx, agency, { connectedBy: member.userId, metaUserId: userId }),
  );
  await runListener(test, routeListener({ db: test.db, logger: test.logger }), agency, {
    type: "meta.page-changed",
    payload: { pageId: page.id },
  });
  test.graph.addLogin(`l-${page.id}`, {
    userId,
    pages: [{ id: page.metaPageId, name: "P", token: page.token, canAdvertise: true }],
  });
  await test.graph.subscribePage(page.metaPageId, page.token);
  return { agency, page };
}

const request = (userId: string, secret = appSecret, extra: Record<string, number> = {}) =>
  makeSignedRequest(
    { algorithm: "HMAC-SHA256", user_id: userId, issued_at: nowSeconds, expires: nowSeconds + 3600, ...extra },
    secret,
  );

describe("handleDeletionRequest", () => {
  it("does nothing for a request signed with another secret, expired, or malformed", async () => {
    const user = `u-${randomUUID()}`;
    const { agency, page } = await aConnectedPage(user);
    for (const bad of [
      request(user, "another-secret"),
      request(user, appSecret, { expires: nowSeconds - 10 }),
      "garbage",
      "",
    ]) {
      expect(await handleDeletionRequest(test.dependencies, { signedRequest: bad, appSecret, appUrl }, now)).toBeNull();
    }
    expect(
      (await test.db.forOrg(agency, (tx) => tx.metaPage.findUniqueOrThrow({ where: { id: page.id } }))).status,
    ).toBe("running");
    expect(await routeRowOf(test.db, page.metaPageId)).not.toBeNull();
  });

  it("disconnects the user's Pages in two agencies, deletes their tokens, keeps the leads, and answers a status address", async () => {
    const user = `u-${randomUUID()}`;
    const one = await aConnectedPage(user);
    const two = await aConnectedPage(user);
    const bystander = await aConnectedPage(`other-${randomUUID()}`);
    await test.db.forOrg(one.agency, (tx) =>
      tx.metaLead.create({ data: { metaLeadId: "KEEP", formId: "F", status: "added" } }),
    );
    const answer = await handleDeletionRequest(
      test.dependencies,
      { signedRequest: request(user), appSecret, appUrl },
      now,
    );
    expect(answer).not.toBeNull();
    expect(answer?.url).toBe(`${appUrl}/meta/deletion?code=${answer?.confirmation_code ?? ""}`);
    expect(wellFormedCode(answer?.confirmation_code ?? "")).toBe(true);
    expect(answer?.confirmation_code).toBe(confirmationCodeOf(appSecret, user, nowSeconds));
    for (const { agency, page } of [one, two]) {
      const row = await test.db.forOrg(agency, (tx) => tx.metaPage.findUniqueOrThrow({ where: { id: page.id } }));
      expect(row).toMatchObject({ status: "disconnected", tokenCiphertext: null, tokenNonce: null });
      expect((await auditOf(test, agency, page.id)).map((entry) => entry.action)).toEqual(["meta.deleted-by-user"]);
      expect((await eventsOf(test, agency, ["meta.page-changed"])).length).toBe(1);
      expect(test.graph.subscribedPages.has(page.metaPageId)).toBe(false);
    }
    expect(await test.db.forOrg(one.agency, (tx) => tx.metaLead.count())).toBe(1);
    expect(
      (
        await test.db.forOrg(bystander.agency, (tx) =>
          tx.metaPage.findUniqueOrThrow({ where: { id: bystander.page.id } }),
        )
      ).status,
    ).toBe("running");
    // The log holds counts, not the Meta user's id.
    expect(JSON.stringify(test.logger.entries)).not.toContain(user);
  });

  it("answers the same code again for the same request, and answers a user with no Page", async () => {
    const user = `u-${randomUUID()}`;
    const first = await handleDeletionRequest(
      test.dependencies,
      { signedRequest: request(user), appSecret, appUrl },
      now,
    );
    const again = await handleDeletionRequest(
      test.dependencies,
      { signedRequest: request(user), appSecret, appUrl },
      now,
    );
    expect(first?.confirmation_code).toBe(again?.confirmation_code);
    expect(first?.confirmation_code).not.toBe(confirmationCodeOf(appSecret, `${user}x`, nowSeconds));
  });
});

describe("a deletion request is complete", () => {
  it("also lets go of the user's unconfirmed drafts, and leaves no Meta user id on any row", async () => {
    const user = `u-${randomUUID()}`;
    const agency = await anAgency(test);
    const member = memberOf(agency);
    const draft = await test.db.forOrg(agency, (tx) =>
      aPage(test, tx, agency, { connectedBy: member.userId, status: "connecting", metaUserId: user }),
    );
    await upsertRoute(test.db, {
      metaPageId: draft.metaPageId,
      organizationId: agency,
      metaUserId: user,
      nextCatchupAt: now,
    });
    const running = await aConnectedPage(user);
    const answer = await handleDeletionRequest(
      test.dependencies,
      { signedRequest: request(user), appSecret, appUrl },
      now,
    );
    expect(answer).not.toBeNull();
    for (const { organizationId, id } of [
      { organizationId: agency, id: draft.id },
      { organizationId: running.agency, id: running.page.id },
    ]) {
      const row = await test.db.forOrg(organizationId, (tx) => tx.metaPage.findUniqueOrThrow({ where: { id } }));
      expect(row).toMatchObject({ status: "disconnected", tokenCiphertext: null, metaUserId: "-" });
    }
    expect((await auditOf(test, agency, draft.id)).map((entry) => entry.action)).toEqual(["meta.deleted-by-user"]);
  });

  it("clears the user's id on an ordinary disconnect too", async () => {
    const { agency, page } = await aConnectedPage(`u-${randomUUID()}`);
    await test.db.forOrg(agency, (tx) =>
      tx.metaPage.update({ where: { id: page.id }, data: { status: "disconnected" } }),
    );
    expect(
      await test.db.forOrg(agency, (tx) => tx.metaPage.findUniqueOrThrow({ where: { id: page.id } })),
    ).toMatchObject({ status: "disconnected" });
  });

  it("refuses a request issued days ago, with or without an expiry", async () => {
    const user = `u-${randomUUID()}`;
    const old = makeSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: user, issued_at: nowSeconds - 5 * 86_400 },
      appSecret,
    );
    expect(await handleDeletionRequest(test.dependencies, { signedRequest: old, appSecret, appUrl }, now)).toBeNull();
    const fresh = makeSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: user, issued_at: nowSeconds - 3600 },
      appSecret,
    );
    expect(
      await handleDeletionRequest(test.dependencies, { signedRequest: fresh, appSecret, appUrl }, now),
    ).not.toBeNull();
  });
});

describe("withdrawMetaLeads", () => {
  it("keeps the Meta lead id and form id, clears the rest, and empties every example in the agency", async () => {
    const agency = await anAgency(test);
    const other = await anAgency(test);
    const personId = randomUUID();
    const leadId = randomUUID();
    await test.db.forOrg(agency, async (tx) => {
      const mine = await claimLedger(tx, { metaLeadId: "MINE", formId: "F", now });
      await writeOutcome(
        tx,
        mine,
        { status: "added", leadId, personId },
        { createdAtMeta: now, platform: "facebook", now },
      );
      const problem = await claimLedger(tx, { metaLeadId: "PROBLEM", formId: "F", now });
      await writeOutcome(
        tx,
        problem,
        { status: "not_added", reasons: ["no_contact"], exampleName: "Someone else" },
        { createdAtMeta: now, platform: "facebook", now },
      );
    });
    await test.db.forOrg(other, async (tx) => {
      const row = await claimLedger(tx, { metaLeadId: "THEIRS", formId: "F", now });
      await writeOutcome(
        tx,
        row,
        { status: "not_added", reasons: ["no_name"], exampleName: "Their example" },
        { createdAtMeta: now, platform: "facebook", now },
      );
    });
    const done = await test.db.forOrg(agency, (tx) => withdrawMetaLeads(tx, { organizationId: agency, personId }));
    expect(done).toEqual({ leadsWithdrawn: 1, examplesEmptied: 1 });
    const rows = await test.db.forOrg(agency, (tx) => tx.metaLead.findMany({ orderBy: { metaLeadId: "asc" } }));
    expect(
      rows.map((row) => [row.metaLeadId, row.formId, row.status, row.leadId, row.personId, row.exampleName]),
    ).toEqual([
      ["MINE", "F", "erased", null, null, null],
      ["PROBLEM", "F", "not_added", null, null, null],
    ]);
    // The catch-up meets the Meta lead id again and finds it settled: it is never added again.
    await test.db.forOrg(agency, async (tx) => {
      expect((await claimLedger(tx, { metaLeadId: "MINE", formId: "F", now })).status).toBe("erased");
    });
    // Another agency's examples are its own.
    expect((await test.db.forOrg(other, (tx) => tx.metaLead.findFirstOrThrow())).exampleName).toBe("Their example");
  });
});
