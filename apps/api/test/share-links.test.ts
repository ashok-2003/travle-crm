// Share links over HTTP (spec 9.3): a link to an issued document, its token shown once, that opens the PDF at /p and
// counts the open; links that never expire; revoking for good; nothing but the organization's own issued documents
// shared. Only roles with settings:manage reach them, and a read-only organization may still turn a link off.
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import type { CreatedShareLink, ShareLinkSummary } from "@travel-crm/contracts/share-links";
import { renderIssuedDocumentListener } from "@travel-crm/domain/documents";
import { runListenerJob } from "@travel-crm/domain/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const profile = {
  legalName: "Konkan Trails LLP",
  gstin: null,
  gstStateCode: "27",
  address: null,
  contactName: null,
  contactPhone: null,
  bankAccountName: null,
  bankAccountNumber: null,
  bankIfsc: null,
  bankName: null,
  invoicePrefix: null,
};

const DAY = 24 * 60 * 60 * 1000;

/** A browser at its own address, so tests don't share the share links' rate-limit bucket. */
const visitor = (address: string) => ({ headers: { "x-forwarded-for": address } });

describe("share links", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  /** An agency's Owner with a sample quotation the worker has rendered. */
  async function sharedSample(): Promise<{ agency: TestAgency; jar: CookieJar; sample: IssuedDocumentSummary }> {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    await dataOf(await mutate(server, "organization.profile.update", profile, jar));
    const sample = await dataOf<IssuedDocumentSummary>(await mutate(server, "documents.issueSample", undefined, jar));
    const event = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { type: "document.issued", payload: { equals: { documentId: sample.id } } },
      }),
    );
    const listener = renderIssuedDocumentListener({
      files: server.files,
      render: () => Promise.resolve(new TextEncoder().encode("%PDF-1.7 sample")),
    });
    await runListenerJob({
      db: server.db,
      listener,
      data: { organizationId: agency.organizationId, eventId: event.id, eventType: event.type },
    });
    return { agency, jar, sample };
  }

  const linksOf = async (jar: CookieJar, sample: IssuedDocumentSummary) =>
    dataOf<ShareLinkSummary[]>(
      await query(server, "shareLinks.list", jar, { recordType: "issued_document", recordId: sample.id }),
    );

  const linkTo = async (jar: CookieJar, sample: IssuedDocumentSummary, extra: { expiresAt?: string | null } = {}) =>
    dataOf<CreatedShareLink>(
      await mutate(
        server,
        "shareLinks.create",
        { recordType: "issued_document", recordId: sample.id, label: `Quotation ${sample.number}`, ...extra },
        jar,
      ),
    );

  it("makes a link to an issued document, shown once, that opens its PDF and counts the open", async () => {
    const { jar, sample } = await sharedSample();
    const link = await linkTo(jar, sample);
    expect(link.path).toBe(`/p/${link.token}`);

    const [listed] = await linksOf(jar, sample);
    expect(listed).toMatchObject({ id: link.shareLinkId, label: `Quotation ${sample.number}`, openCount: 0 });
    expect(new Date(listed?.expiresAt ?? 0).getTime() - Date.now()).toBeGreaterThan(29 * DAY);
    // Only a hash of the token is kept: no list shows it again.
    expect(JSON.stringify(await linksOf(jar, sample))).not.toContain(link.token.slice(22));

    const opened = await server.app.request(link.path, visitor("203.0.113.31"));
    expect(opened.status).toBe(302);
    expect(opened.headers.get("location")).toContain(encodeURIComponent(`${sample.number}.pdf`));
    const [counted] = await linksOf(jar, sample);
    expect(counted).toMatchObject({ openCount: 1, revokedAt: null });
    expect(counted?.lastOpenedAt).not.toBeNull();
  });

  it("makes a link that never expires when asked", async () => {
    const { jar, sample } = await sharedSample();
    await linkTo(jar, sample, { expiresAt: null });
    expect(await linksOf(jar, sample)).toMatchObject([{ expiresAt: null }]);
  });

  it("turns a link off for good: it is refused at once, and turning it off again changes nothing", async () => {
    const { jar, sample } = await sharedSample();
    const link = await linkTo(jar, sample);
    expect((await mutate(server, "shareLinks.revoke", { shareLinkId: link.shareLinkId }, jar)).status).toBe(200);
    const refused = await server.app.request(link.path, visitor("203.0.113.32"));
    expect(refused.status).toBe(410);
    expect(await refused.text()).toContain("This link has been turned off");
    expect((await mutate(server, "shareLinks.revoke", { shareLinkId: link.shareLinkId }, jar)).status).toBe(200);
    const [listed] = await linksOf(jar, sample);
    expect(listed?.revokedAt).not.toBeNull();
    expect(listed?.openCount).toBe(0);
  });

  it("shares nothing but the organization's own issued documents", async () => {
    const { jar, sample } = await sharedSample();
    const { sample: theirs } = await sharedSample();
    const create = (recordType: string, recordId: string) =>
      mutate(server, "shareLinks.create", { recordType, recordId, label: "A link" }, jar);
    expect(await refusalOf(await create("lead", sample.id))).toEqual({ status: 400, reason: "INVALID_RECORD_TYPE" });
    expect(await refusalOf(await create("issued_document", theirs.id))).toEqual({
      status: 404,
      reason: "DOCUMENT_NOT_FOUND",
    });
    expect(
      await refusalOf(await query(server, "shareLinks.list", jar, { recordType: "lead", recordId: sample.id })),
    ).toEqual({ status: 400, reason: "INVALID_RECORD_TYPE" });
  });

  it("can't turn off another organization's link", async () => {
    const { jar } = await sharedSample();
    const other = await sharedSample();
    const theirs = await linkTo(other.jar, other.sample);
    expect(
      await refusalOf(await mutate(server, "shareLinks.revoke", { shareLinkId: theirs.shareLinkId }, jar)),
    ).toEqual({ status: 404, reason: "LINK_NOT_FOUND" });
    expect(await linksOf(other.jar, other.sample)).toMatchObject([{ revokedAt: null }]);
  });

  it("refuses staff without settings:manage", async () => {
    const { agency, jar, sample } = await sharedSample();
    const link = await linkTo(jar, sample);
    const sales = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const salesJar = await signedInStaff(server, agency, sales);
    const refused = { status: 403, reason: "MISSING_PERMISSION" };
    const record = { recordType: "issued_document", recordId: sample.id };
    expect(await refusalOf(await query(server, "shareLinks.list", salesJar, record))).toEqual(refused);
    expect(await refusalOf(await mutate(server, "shareLinks.create", { ...record, label: "x" }, salesJar))).toEqual(
      refused,
    );
    expect(
      await refusalOf(await mutate(server, "shareLinks.revoke", { shareLinkId: link.shareLinkId }, salesJar)),
    ).toEqual(refused);
  });

  it("lets a read-only organization's Owner see and turn off links, but make none", async () => {
    const { agency, jar, sample } = await sharedSample();
    const link = await linkTo(jar, sample);
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "read_only", statusChangedAt: new Date() },
    });
    expect(await linksOf(jar, sample)).toHaveLength(1);
    expect(
      await refusalOf(
        await mutate(
          server,
          "shareLinks.create",
          { recordType: "issued_document", recordId: sample.id, label: "x" },
          jar,
        ),
      ),
    ).toEqual({ status: 403, reason: "ORGANIZATION_READ_ONLY" });
    // Turning a link off takes a customer's access away, which read-only allows (ADR 0021).
    expect((await mutate(server, "shareLinks.revoke", { shareLinkId: link.shareLinkId }, jar)).status).toBe(200);
  });
});
