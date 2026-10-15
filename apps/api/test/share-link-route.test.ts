// GET /p/<token>: opens the link, hands the record to its resolver, and answers customers with a small page when the
// link doesn't work. Tested with stand-ins for findShareLink and recordShareLinkOpen, then once against the database.
import { brand } from "@travel-crm/brand";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { DomainError } from "@travel-crm/domain/kernel";
import {
  createShareLink,
  findShareLink,
  recordShareLinkOpen,
  type OpenedShareLink,
  type ShareLinkVisitor,
} from "@travel-crm/domain/share-links";
import { afterAll, beforeAll, describe, expect, inject, it, onTestFinished, vi } from "vitest";
import { clientAddressFrom } from "../src/rate-limit.js";
import { shareLinkRoutes, tooManyRequestsPage, type ShareLinkRouteOptions } from "../src/share-link-route.js";

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

const noRecording: ShareLinkRouteOptions["recordOpen"] = () => Promise.resolve();

function routes(
  find: ShareLinkRouteOptions["find"],
  resolvers: ShareLinkRouteOptions["resolvers"] = {},
  recordOpen: ShareLinkRouteOptions["recordOpen"] = noRecording,
) {
  const clientAddress = clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies: [] });
  return shareLinkRoutes({ find, recordOpen, resolvers, clientAddress });
}

/** The opens a route records, with the stand-in for the domain that collects them. */
function recorder() {
  const recorded: { opened: OpenedShareLink; visitor: ShareLinkVisitor }[] = [];
  const recordOpen: ShareLinkRouteOptions["recordOpen"] = (opened, visitor) => {
    recorded.push({ opened, visitor });
    return Promise.resolve();
  };
  return { recorded, recordOpen };
}

function expectPrivate(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("share-link route", () => {
  it("opens the link and answers with what the record's resolver returns, kept private", async () => {
    const { recorded, recordOpen } = recorder();
    let foundToken: unknown;
    const app = routes(
      (token) => {
        foundToken = token;
        return Promise.resolve(opened);
      },
      { issued_document: redirectToPdf },
      recordOpen,
    );
    const response = await app.request("/abc", {
      headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "Test browser" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`https://files.example/${opened.recordId}.pdf`);
    expectPrivate(response);
    expect(foundToken).toBe("abc");
    expect(recorded).toEqual([
      { opened, visitor: { ipAddress: "203.0.113.9", userAgent: "Test browser", preview: false } },
    ]);
  });

  it("marks HEAD requests, prefetches and link-preview bots as previews", async () => {
    const { recorded, recordOpen } = recorder();
    const app = routes(() => Promise.resolve(opened), { issued_document: redirectToPdf }, recordOpen);
    await app.request("/abc", { method: "HEAD" });
    await app.request("/abc", { headers: { "sec-purpose": "prefetch;prerender" } });
    await app.request("/abc", { headers: { purpose: "prefetch" } });
    await app.request("/abc", { headers: { "user-agent": "WhatsApp/2.24.1 A" } });
    await app.request("/abc", { headers: { "user-agent": "facebookexternalhit/1.1" } });
    await app.request("/abc", { headers: { "user-agent": "Mozilla/5.0 (iPhone) Safari" } });
    // Tokens match in any case; WhatsApp's own fetcher has a fixed shape, so a browser that merely mentions it is a customer.
    await app.request("/abc", { headers: { "user-agent": "SLACKBOT-LinkExpanding 1.0" } });
    await app.request("/abc", { headers: { "user-agent": "whatsapp/2.24.1 i" } });
    await app.request("/abc", {
      headers: { "user-agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile WhatsApp/2.24.1" },
    });
    expect(recorded.map((entry) => entry.visitor.preview)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      false,
    ]);
  });

  it("records an open only once the resolver has answered with success", async () => {
    const { recorded, recordOpen } = recorder();
    const answer = (status: number) => () => Promise.resolve(new Response("x", { status }));
    expect(
      (await routes(() => Promise.resolve(opened), { issued_document: answer(200) }, recordOpen).request("/abc"))
        .status,
    ).toBe(200);
    expect(recorded).toHaveLength(1);

    expect(
      (await routes(() => Promise.resolve(opened), { issued_document: answer(503) }, recordOpen).request("/abc"))
        .status,
    ).toBe(503);
    expect(
      (await routes(() => Promise.resolve(opened), { issued_document: answer(404) }, recordOpen).request("/abc"))
        .status,
    ).toBe(404);
    expect(
      (await routes(() => Promise.resolve({ ...opened, recordType: "lead" }), {}, recordOpen).request("/abc")).status,
    ).toBe(404);
    expect(recorded).toHaveLength(1);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => {
      error.mockRestore();
    });
    const failing = routes(
      () => Promise.resolve(opened),
      { issued_document: () => Promise.reject(new Error("pdf store down")) },
      recordOpen,
    );
    expect((await failing.request("/abc")).status).toBe(500);
    expect(recorded).toHaveLength(1);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: "pdf store down" }));
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

  it("shows a resolver's 'not found' as a page: 503 with Retry-After while a document is being prepared", async () => {
    const { recorded, recordOpen } = recorder();
    const refusing = (reason: string) =>
      routes(
        () => Promise.resolve(opened),
        { issued_document: () => Promise.reject(new DomainError("NOT_FOUND", reason, "x")) },
        recordOpen,
      );
    const notReady = await refusing("DOCUMENT_NOT_READY").request("/abc");
    expect(notReady.status).toBe(503);
    expect(notReady.headers.get("retry-after")).toBe("30");
    expect(notReady.headers.get("content-type")).toMatch(/^text\/html; charset=utf-8/i);
    expectPrivate(notReady);
    expect(await notReady.text()).toContain("This document is still being prepared");

    const gone = await refusing("DOCUMENT_NOT_FOUND").request("/abc");
    expect(gone.status).toBe(404);
    expect(gone.headers.get("retry-after")).toBeNull();
    expect(await gone.text()).toContain("This link doesn't work");
    // The customer saw neither record.
    expect(recorded).toEqual([]);
  });

  it("has a page for a browser that tried too often, with how long to wait", async () => {
    const page = tooManyRequestsPage(42);
    expect(page.status).toBe(429);
    expect(page.headers.get("retry-after")).toBe("42");
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expectPrivate(page);
    expect(await page.text()).toContain("Too many tries");
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
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => {
      error.mockRestore();
    });
    const response = await routes(() => Promise.reject(new Error("database down"))).request("/abc");
    expect(response.status).toBe(500);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: "database down" }));
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
    const app = routes(
      (token) => findShareLink(db, token),
      { issued_document: redirectToPdf },
      (link, visitor) => recordShareLinkOpen(db, link, visitor),
    );

    const response = await app.request(link.path.slice("/p".length), { headers: { "x-forwarded-for": "203.0.113.9" } });
    expect(response.status).toBe(302);
    const opens = await db.forOrg(organizationId, (tx) => tx.shareLinkOpen.findMany());
    expect(opens.map((open) => open.ipAddress)).toEqual(["203.0.113.0"]);

    // A preview (HEAD, prefetch, WhatsApp) and an IPv6 visitor: only the real open is recorded, with its /48.
    await app.request(link.path.slice("/p".length), { method: "HEAD", headers: { "x-forwarded-for": "203.0.113.9" } });
    await app.request(link.path.slice("/p".length), { headers: { "x-forwarded-for": "2001:db8:85a3:1::1" } });
    const afterIpv6 = await db.forOrg(organizationId, (tx) =>
      tx.shareLinkOpen.findMany({ orderBy: { openedAt: "asc" } }),
    );
    expect(afterIpv6.map((open) => open.ipAddress)).toEqual(["203.0.113.0", "2001:db8:85a3::"]);

    await db.forOrg(organizationId, (tx) =>
      tx.shareLink.update({ where: { id: link.shareLinkId }, data: { revokedAt: new Date() } }),
    );
    expect((await app.request(link.path.slice("/p".length))).status).toBe(410);
  });
});
