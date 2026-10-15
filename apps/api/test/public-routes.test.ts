// The public routes as the api serves them: a share link opens an issued document's PDF once the worker has rendered
// it, both routes are rate-limited per client address, and webhooks reach the providers the api was given.
import { createHmac, randomUUID } from "node:crypto";
import type { IssueDocumentInput } from "@travel-crm/contracts/documents";
import { issueDocument, renderIssuedDocumentListener } from "@travel-crm/domain/documents";
import { runListenerJob } from "@travel-crm/domain/jobs";
import { systemActor } from "@travel-crm/domain/kernel";
import { createShareLink } from "@travel-crm/domain/share-links";
import { hmacSha256Signature, type WebhookProvider } from "@travel-crm/domain/webhooks";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";

const webhookSecret = "public-routes-secret";

const exampleProvider: WebhookProvider = {
  name: "example",
  keptHeaders: ["x-example-signature"],
  verify: hmacSha256Signature({ secret: webhookSecret, header: "x-example-signature", encoding: "hex" }),
  identify: ({ rawBody }) => ({ eventId: (JSON.parse(rawBody) as { id: string }).id, eventType: "example.sent" }),
  process: () => Promise.resolve(),
};

const quotation: IssueDocumentInput = {
  template: "sample",
  content: {
    title: "Quotation",
    recipient: { name: "Meera Iyer", lines: ["Mumbai 400002"] },
    rows: [{ description: "Andaman islands, 6 nights", amount: "₹1,46,500.00" }],
    totals: [{ label: "Total", amount: "₹1,46,500.00", emphasis: true }],
  },
  branding: { organizationName: "Sharma Holidays" },
};

/** A browser at its own address, so tests don't share rate-limit buckets. */
const fromAddress = (address: string) => ({ headers: { "x-forwarded-for": address } });

describe("public routes", () => {
  const queue = createMemoryJobQueue();
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer({}, { webhookProviders: [exampleProvider], queue });
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("opens a shared document's PDF once it is rendered, and asks for patience until then", async () => {
    const actor = systemActor(agency.organizationId);
    const { document, link } = await server.db.forOrg(agency.organizationId, async (tx) => {
      const issued = await issueDocument(tx, actor, { ...quotation });
      const shared = await createShareLink(tx, actor, {
        recordType: "issued_document",
        recordId: issued.id,
        label: `Quotation ${issued.number}`,
      });
      return { document: issued, link: shared };
    });
    const opens = () =>
      server.db.forOrg(agency.organizationId, (tx) =>
        tx.shareLinkOpen.count({ where: { shareLinkId: link.shareLinkId } }),
      );
    const address = `203.0.113.${String(Math.floor(Math.random() * 200))}`;

    const early = await server.app.request(link.path, fromAddress(address));
    expect(early.status).toBe(503);
    expect(early.headers.get("retry-after")).toBe("30");
    expect(await early.text()).toContain("still being prepared");
    // The customer didn't get the document, so the link wasn't opened yet.
    expect(await opens()).toBe(0);

    // What the worker does after issuing: run the render listener for the document.issued event.
    const event = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { type: "document.issued", payload: { equals: { documentId: document.id } } },
      }),
    );
    const listener = renderIssuedDocumentListener({
      files: server.files,
      render: () => Promise.resolve(new TextEncoder().encode("%PDF-1.3 test")),
    });
    expect(
      await runListenerJob({
        db: server.db,
        listener,
        data: { organizationId: agency.organizationId, eventId: event.id, eventType: event.type },
      }),
    ).toBe("handled");

    const opened = await server.app.request(link.path, fromAddress(address));
    expect(opened.status).toBe(302);
    expect(opened.headers.get("location")).toMatch(/^memory:\/\/download\//);
    expect(opened.headers.get("location")).toContain(encodeURIComponent(`${document.number}.pdf`));
    expect(opened.headers.get("cache-control")).toBe("no-store");
    expect(opened.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await opens()).toBe(1);
  });

  it("says plainly that a document that can never render can't be shown, without asking to retry", async () => {
    const actor = systemActor(agency.organizationId);
    const link = await server.db.forOrg(agency.organizationId, async (tx) => {
      const issued = await issueDocument(tx, actor, { ...quotation });
      // What the render listener records when the fonts can't show the text (D2).
      await tx.issuedDocument.update({ where: { id: issued.id }, data: { renderFailure: "UNPRINTABLE_TEXT: U+0939" } });
      return createShareLink(tx, actor, {
        recordType: "issued_document",
        recordId: issued.id,
        label: `Quotation ${issued.number}`,
      });
    });
    const page = await server.app.request(link.path, fromAddress("203.0.113.250"));
    expect(page.status).toBe(404);
    expect(page.headers.get("retry-after")).toBeNull();
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("x-robots-tag")).toBe("noindex");
    const text = await page.text();
    expect(text).toContain("This document can't be shown");
    expect(text).toContain("Ask whoever sent it for a new copy.");
    expect(text).not.toContain("still being prepared");
    const opens = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.shareLinkOpen.count({ where: { shareLinkId: link.shareLinkId } }),
    );
    expect(opens).toBe(0);
  });

  it("limits share-link requests per client address with a page a browser can show, and leaves others alone", async () => {
    // Every request in one limit window: the clock stands still a second after a window opens.
    vi.useFakeTimers({ toFake: ["Date"] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.setSystemTime(Math.floor(Date.now() / 60_000) * 60_000 + 1_000);
    const octet = Math.floor(Math.random() * 200);
    const guesser = `198.51.100.${String(octet)}`;
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 30; attempt += 1) {
      statuses.push((await server.app.request(`/p/${randomUUID()}`, fromAddress(guesser))).status);
    }
    expect(statuses.every((status) => status === 404)).toBe(true);
    const limited = await server.app.request(`/p/${randomUUID()}`, fromAddress(guesser));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("59");
    expect(limited.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(limited.headers.get("cache-control")).toBe("no-store");
    expect(await limited.text()).toContain("Too many tries");
    const neighbour = `198.51.100.${String(octet + 50)}`;
    expect((await server.app.request(`/p/${randomUUID()}`, fromAddress(neighbour))).status).toBe(404);
  });

  it("takes a signed webhook from a known provider, queues its processing, and refuses unknown ones", async () => {
    const body = JSON.stringify({ id: `evt_${randomUUID()}` });
    const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");
    const delivered = await server.app.request("/webhooks/example", {
      method: "POST",
      headers: { "x-example-signature": signature, "x-forwarded-for": "192.0.2.10" },
      body,
    });
    expect(delivered.status).toBe(200);
    expect(queue.sent.filter((job) => job.queue === "webhooks.process")).toHaveLength(1);
    expect(
      (
        await server.app.request("/webhooks/unknown", {
          method: "POST",
          headers: fromAddress("192.0.2.10").headers,
          body,
        })
      ).status,
    ).toBe(404);
    const unsigned = await server.app.request("/webhooks/example", {
      method: "POST",
      headers: fromAddress("192.0.2.10").headers,
      body,
    });
    expect(unsigned.status).toBe(401);
  });
});
