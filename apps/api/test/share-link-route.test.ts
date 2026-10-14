// GET /p/<token>: opens the link, hands the record to its resolver, and answers customers with a small page when the
// link doesn't work. Tested with a stand-in for openShareLink, then once against the database.
import { brand } from "@travel-crm/brand";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { DomainError } from "@travel-crm/domain/kernel";
import { createShareLink, openShareLink, type OpenedShareLink } from "@travel-crm/domain/share-links";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clientAddressFrom } from "../src/rate-limit.js";
import { shareLinkRoutes, type ShareLinkRouteOptions } from "../src/share-link-route.js";

const opened: OpenedShareLink = {
  organizationId: "0199e7a0-0000-7000-8000-0000000000aa",
  shareLinkId: "0199e7a0-0000-7000-8000-0000000000bb",
  recordType: "issued_document",
  recordId: "0199e7a0-0000-7000-8000-0000000000cc",
  label: "Quotation QT-2026-0042",
  createdBy: null,
};

const redirectToPdf = (link: OpenedShareLink) =>
  Promise.resolve(Response.redirect(`https://files.example/${link.recordId}.pdf`, 302));

function routes(open: ShareLinkRouteOptions["open"], resolvers: ShareLinkRouteOptions["resolvers"] = {}) {
  const clientAddress = clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies: [] });
  return shareLinkRoutes({ open, resolvers, clientAddress });
}

function expectPrivate(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
}

describe("share-link route", () => {
  it("opens the link and answers with what the record's resolver returns, kept private", async () => {
    let visitor: unknown;
    const app = routes(
      (token, seen) => {
        visitor = { token, ...seen };
        return Promise.resolve(opened);
      },
      { issued_document: redirectToPdf },
    );
    const response = await app.request("/abc", {
      headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "Test browser" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`https://files.example/${opened.recordId}.pdf`);
    expectPrivate(response);
    expect(visitor).toEqual({ token: "abc", ipAddress: "203.0.113.9", userAgent: "Test browser" });
  });

  it("explains a link that doesn't work: 404 for an unknown one, 410 for an expired or revoked one", async () => {
    const failing = (reason: string) => routes(() => Promise.reject(new DomainError("NOT_FOUND", reason, "x")));
    const unknown = await failing("LINK_NOT_FOUND").request("/abc");
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("content-type")).toMatch(/^text\/html; charset=utf-8/i);
    expectPrivate(unknown);
    expect(unknown.headers.get("content-security-policy")).toContain("default-src 'none'");
    const page = await unknown.text();
    expect(page).toContain("This link doesn't work");
    expect(page).toContain(`<title>This link doesn't work · ${brand.productName}</title>`);

    const expired = await failing("LINK_EXPIRED").request("/abc");
    expect(expired.status).toBe(410);
    expect(await expired.text()).toContain("This link has expired");
    const revoked = await failing("LINK_REVOKED").request("/abc");
    expect(revoked.status).toBe(410);
    expect(await revoked.text()).toContain("This link has been turned off");
  });

  it("answers 404 for a record type no resolver knows, including Object's own keys", async () => {
    for (const recordType of ["lead", "constructor", "__proto__"]) {
      const response = await routes(() => Promise.resolve({ ...opened, recordType }), {
        issued_document: redirectToPdf,
      }).request("/abc");
      expect(response.status).toBe(404);
    }
  });

  it("lets other failures through as server errors", async () => {
    const response = await routes(() => Promise.reject(new Error("database down"))).request("/abc");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("database down");
  });
});

describe("share-link route against the database", () => {
  let platform: PlatformClient;
  let db: Database;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("opens a real link, records the visit with a shortened address, and refuses it once revoked", async () => {
    const organizationId = await createTestOrganization(platform, "Route agency");
    const actor = { organizationId, userId: null, source: "web" as const, impersonatedBy: null };
    const link = await db.forOrg(organizationId, (tx) => createShareLink(tx, actor, { ...opened, label: "Quotation" }));
    const app = routes((token, visitor) => openShareLink(db, token, visitor), { issued_document: redirectToPdf });

    const response = await app.request(link.path.slice("/p".length), { headers: { "x-forwarded-for": "203.0.113.9" } });
    expect(response.status).toBe(302);
    const opens = await db.forOrg(organizationId, (tx) => tx.shareLinkOpen.findMany());
    expect(opens.map((open) => open.ipAddress)).toEqual(["203.0.113.0"]);

    await db.forOrg(organizationId, (tx) =>
      tx.shareLink.update({ where: { id: link.shareLinkId }, data: { revokedAt: new Date() } }),
    );
    expect((await app.request(link.path.slice("/p".length))).status).toBe(410);
  });
});
