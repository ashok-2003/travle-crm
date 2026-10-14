// Share links (spec 9.3) against Postgres: a link opens one record, expires, can be revoked, records every open and
// publishes share-link.opened, and never opens another organization's record.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Actor } from "../../src/kernel/index.js";
import { createShareLink, listShareLinks, openShareLink, revokeShareLink } from "../../src/share-links/index.js";

const DAY = 24 * 60 * 60 * 1000;
const visitor = { ipAddress: "203.0.113.77", userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/140.0" };

describe("share links", () => {
  let platform: PlatformClient;
  let db: Database;
  let agent: Actor;
  let otherAgent: Actor;
  const record = { recordType: "issued_document", recordId: "0199e7a0-0000-7000-8000-0000000000d1" };

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    const organizationId = await createTestOrganization(platform, "Share links");
    const otherOrganizationId = await createTestOrganization(platform, "Other share links");
    agent = { organizationId, userId: "0199e7a0-0000-7000-8000-0000000000a1", source: "web", impersonatedBy: null };
    otherAgent = { ...agent, organizationId: otherOrganizationId };
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  const share = (input: { label?: string; expiresAt?: Date | null } = {}, actor = agent) =>
    db.forOrg(actor.organizationId, (tx) =>
      createShareLink(tx, actor, {
        ...record,
        label: input.label ?? "Quotation QT-2026-0042",
        expiresAt: input.expiresAt,
      }),
    );

  it("opens the record it was made for, records the open and publishes share-link.opened", async () => {
    const link = await share();
    expect(link.path).toBe(`/p/${link.token}`);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{65}$/);

    const opened = await openShareLink(db, link.token, visitor);
    expect(opened).toEqual({
      organizationId: agent.organizationId,
      shareLinkId: link.shareLinkId,
      ...record,
      label: "Quotation QT-2026-0042",
      createdBy: agent.userId,
    });
    const [open] = await db.forOrg(agent.organizationId, (tx) =>
      tx.shareLinkOpen.findMany({ where: { shareLinkId: link.shareLinkId } }),
    );
    expect(open).toMatchObject({ ipAddress: "203.0.113.0", userAgent: visitor.userAgent });
    const events = await db.forOrg(agent.organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "share-link.opened" } }),
    );
    expect(events.map((event) => event.payload)).toContainEqual({ shareLinkId: link.shareLinkId, openId: open?.id });
  });

  it("stores only a hash of the token's secret part", async () => {
    const link = await share();
    const stored = await db.forOrg(agent.organizationId, (tx) =>
      tx.shareLink.findUniqueOrThrow({ where: { id: link.shareLinkId } }),
    );
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(link.token).not.toContain(stored.tokenHash);
  });

  it("expires after 30 days unless told otherwise, and a link without expiry keeps working", async () => {
    const lasting = await share();
    await expect(openShareLink(db, lasting.token, visitor, new Date(Date.now() + 29 * DAY))).resolves.toBeDefined();
    await expect(openShareLink(db, lasting.token, visitor, new Date(Date.now() + 31 * DAY))).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "LINK_EXPIRED",
    });
    const forever = await share({ expiresAt: null });
    await expect(openShareLink(db, forever.token, visitor, new Date(Date.now() + 3650 * DAY))).resolves.toBeDefined();
  });

  it("stops working once revoked, and revoking twice is harmless", async () => {
    const link = await share();
    await db.forOrg(agent.organizationId, (tx) => revokeShareLink(tx, agent, { shareLinkId: link.shareLinkId }));
    await db.forOrg(agent.organizationId, (tx) => revokeShareLink(tx, agent, { shareLinkId: link.shareLinkId }));
    await expect(openShareLink(db, link.token, visitor)).rejects.toMatchObject({ reason: "LINK_REVOKED" });
    const stored = await db.forOrg(agent.organizationId, (tx) =>
      tx.shareLink.findUniqueOrThrow({ where: { id: link.shareLinkId } }),
    );
    expect(stored.revokedBy).toBe(agent.userId);
  });

  it("finds nothing for unknown, malformed or altered tokens", async () => {
    const link = await share();
    const notFound = { code: "NOT_FOUND", reason: "LINK_NOT_FOUND" };
    const otherSecret = `${link.token.slice(0, 22)}${"A".repeat(43)}`;
    await expect(openShareLink(db, otherSecret, visitor)).rejects.toMatchObject(notFound);
    await expect(openShareLink(db, "not-a-token", visitor)).rejects.toMatchObject(notFound);
    await expect(openShareLink(db, `${link.token}x`, visitor)).rejects.toMatchObject(notFound);
    // The same secret under another organization's id opens nothing: the secret is looked up in that organization.
    const theirs = await share({}, otherAgent);
    const crossed = `${theirs.token.slice(0, 22)}${link.token.slice(22)}`;
    await expect(openShareLink(db, crossed, visitor)).rejects.toMatchObject(notFound);
  });

  it("can't revoke another organization's link", async () => {
    const theirs = await share({}, otherAgent);
    await expect(
      db.forOrg(agent.organizationId, (tx) => revokeShareLink(tx, agent, { shareLinkId: theirs.shareLinkId })),
    ).rejects.toMatchObject({ code: "NOT_FOUND", reason: "LINK_NOT_FOUND" });
  });

  it("lists a record's links, newest first, with how often and when they were opened", async () => {
    const recordId = "0199e7a0-0000-7000-8000-0000000000d2";
    const listed = { recordType: "issued_document", recordId };
    const first = await db.forOrg(agent.organizationId, (tx) =>
      createShareLink(tx, agent, { ...listed, label: "First" }),
    );
    const second = await db.forOrg(agent.organizationId, (tx) =>
      createShareLink(tx, agent, { ...listed, label: "Second" }),
    );
    await openShareLink(db, first.token, visitor);
    await openShareLink(db, first.token, visitor);

    const links = await db.forOrg(agent.organizationId, (tx) => listShareLinks(tx, listed));
    expect(links.map((link) => [link.id, link.label, link.openCount])).toEqual([
      [second.shareLinkId, "Second", 0],
      [first.shareLinkId, "First", 2],
    ]);
    expect(links[1]?.lastOpenedAt).not.toBeNull();
    expect(links[0]).toMatchObject({ lastOpenedAt: null, revokedAt: null, createdBy: agent.userId });
    expect(await db.forOrg(otherAgent.organizationId, (tx) => listShareLinks(tx, listed))).toEqual([]);
  });

  it("refuses a malformed record type or id, an empty label, or an expiry in the past", async () => {
    const make = (input: Partial<Parameters<typeof createShareLink>[2]>) =>
      db.forOrg(agent.organizationId, (tx) => createShareLink(tx, agent, { ...record, label: "Quote", ...input }));
    await expect(make({ recordType: "Issued Document" })).rejects.toMatchObject({ reason: "INVALID_RECORD_TYPE" });
    await expect(make({ recordId: "42" })).rejects.toMatchObject({ reason: "INVALID_RECORD_ID" });
    await expect(make({ label: "   " })).rejects.toMatchObject({ reason: "INVALID_LABEL" });
    await expect(make({ expiresAt: new Date(Date.now() - 1000) })).rejects.toMatchObject({
      reason: "EXPIRY_IN_THE_PAST",
    });
  });

  it("lets the api revoke a link but never edit or delete it", async () => {
    const link = await share();
    await expect(
      db.forOrg(agent.organizationId, (tx) => tx.$executeRaw`UPDATE share_link SET label = 'changed'`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.forOrg(
        agent.organizationId,
        (tx) => tx.$executeRaw`DELETE FROM share_link WHERE id = ${link.shareLinkId}::uuid`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
