// The organization's logo over HTTP (spec 9.3): a PNG or JPEG of at most 1 MB, uploaded straight to storage and shown
// through a short-lived link; the newest is the logo, and removing it takes the ones it replaced with it. Only roles
// with settings:manage reach it, and a read-only organization's Owner may look but not change it.
import type { LogoUpload, OrganizationLogo } from "@travel-crm/contracts/profile";
import { systemActor } from "@travel-crm/domain/kernel";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

/** What the browser would send: storage checks only its size and declared type. */
const pngBytes = new TextEncoder().encode("the bytes of a logo");

describe("the organization's logo", () => {
  let server: TestServer;
  let storage: MemoryStorage;

  beforeAll(() => {
    storage = createMemoryStorage();
    server = createTestServer({}, { storage });
  });

  afterAll(async () => {
    await server.close();
  });

  /** Uploads a logo as the branding screen does: ask for a link, PUT the file to storage, confirm it. */
  async function uploadedLogo(jar: CookieJar, fileName = "Logo.png"): Promise<OrganizationLogo> {
    const { attachmentId, upload } = await dataOf<LogoUpload>(
      await mutate(
        server,
        "organization.logo.requestUpload",
        { fileName, contentType: "image/png", sizeBytes: pngBytes.byteLength },
        jar,
      ),
    );
    await storage.upload({ ...upload, expiresAt: new Date(upload.expiresAt) }, pngBytes, "image/png");
    return dataOf<OrganizationLogo>(await mutate(server, "organization.logo.confirmUpload", { attachmentId }, jar));
  }

  it("lets the Owner upload a logo straight to storage, and shows it through a short-lived link", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    expect(await dataOf(await query(server, "organization.logo.get", jar))).toBeNull();

    const logo = await uploadedLogo(jar);
    const key = `organizations/${agency.organizationId}/attachments/${logo.attachmentId}`;
    expect(storage.objects.get(key)?.contentType).toBe("image/png");
    expect(logo).toMatchObject({ fileName: "Logo.png" });
    expect(logo.url).toContain(encodeURIComponent(key));
    expect(new Date(logo.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(await dataOf<OrganizationLogo>(await query(server, "organization.logo.get", jar))).toMatchObject({
      attachmentId: logo.attachmentId,
      fileName: "Logo.png",
    });
  });

  it("makes the newest logo the logo, and removing it takes the ones it replaced with it", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    const first = await uploadedLogo(jar, "First.png");
    const second = await uploadedLogo(jar, "Second.png");
    const current = async () =>
      (await dataOf<OrganizationLogo | null>(await query(server, "organization.logo.get", jar)))?.attachmentId ?? null;
    expect(await current()).toBe(second.attachmentId);

    // A screen still showing the first logo removes only that one and older: the newer one stays.
    expect((await mutate(server, "organization.logo.remove", { attachmentId: first.attachmentId }, jar)).status).toBe(
      200,
    );
    expect(await current()).toBe(second.attachmentId);
    const third = await uploadedLogo(jar, "Third.png");
    await dataOf(await mutate(server, "organization.logo.remove", { attachmentId: third.attachmentId }, jar));
    // Not the second logo coming back: it went with the one that replaced it.
    expect(await current()).toBeNull();
  });

  it("refuses other images and larger files before handing out an upload link", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    for (const input of [
      { fileName: "Logo.svg", contentType: "image/svg+xml", sizeBytes: 900 },
      { fileName: "Logo.webp", contentType: "image/webp", sizeBytes: 900 },
      { fileName: "Logo.png", contentType: "image/png", sizeBytes: 1024 * 1024 + 1 },
    ]) {
      const response = await mutate(server, "organization.logo.requestUpload", input, jar);
      expect(response.status, input.contentType).toBe(400);
    }
  });

  it("confirms and removes only the organization's logos, never another of its files", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    const licence = await server.files.storeGeneratedFile(systemActor(agency.organizationId), {
      recordType: "organization",
      recordId: agency.organizationId,
      fileName: "Licence.png",
      contentType: "image/png",
      body: pngBytes,
    });
    for (const path of ["organization.logo.confirmUpload", "organization.logo.remove"]) {
      expect(await refusalOf(await mutate(server, path, { attachmentId: licence.id }, jar)), path).toEqual({
        status: 404,
        reason: "ATTACHMENT_NOT_FOUND",
      });
    }
    expect(await dataOf(await query(server, "organization.logo.get", jar))).toBeNull();
  });

  it("refuses staff without settings:manage", async () => {
    const agency = await createTestAgency(server);
    const sales = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, sales);
    const refused = { status: 403, reason: "MISSING_PERMISSION" };
    expect(await refusalOf(await query(server, "organization.logo.get", jar))).toEqual(refused);
    const attachmentId = "0199e7a0-0000-7000-8000-00000000a001";
    for (const [path, input] of [
      ["organization.logo.requestUpload", { fileName: "Logo.png", contentType: "image/png", sizeBytes: 9 }],
      ["organization.logo.confirmUpload", { attachmentId }],
      ["organization.logo.remove", { attachmentId }],
    ] as const) {
      expect(await refusalOf(await mutate(server, path, input, jar)), path).toEqual(refused);
    }
  });

  it("lets a read-only organization's Owner see the logo, but not change it", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    const logo = await uploadedLogo(jar);
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "read_only", statusChangedAt: new Date() },
    });
    expect(await dataOf<OrganizationLogo>(await query(server, "organization.logo.get", jar))).toMatchObject({
      attachmentId: logo.attachmentId,
    });
    const readOnly = { status: 403, reason: "ORGANIZATION_READ_ONLY" };
    expect(
      await refusalOf(
        await mutate(
          server,
          "organization.logo.requestUpload",
          { fileName: "Logo.png", contentType: "image/png", sizeBytes: 9 },
          jar,
        ),
      ),
    ).toEqual(readOnly);
    expect(
      await refusalOf(await mutate(server, "organization.logo.remove", { attachmentId: logo.attachmentId }, jar)),
    ).toEqual(readOnly);
  });
});
