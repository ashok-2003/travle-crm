// The organization's logo over HTTP (spec 9.3): a PNG or JPEG of at most 1 MB, 4096 pixels a side and 16 megapixels,
// uploaded straight to storage and shown through a short-lived link; the newest is the logo, and removing it takes the
// ones it replaced with it. Only roles with settings:manage reach it, and a read-only organization's Owner may look
// but not change it.
import type { LogoUpload, OrganizationLogo } from "@travel-crm/contracts/profile";
import { systemActor } from "@travel-crm/domain/kernel";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import {
  narrowInterlacedPng,
  pngOfSize,
  pngWithFilterType,
  pngWithOversizedPixelData,
  pngWithSecondHeader,
  tinyPng,
} from "@travel-crm/integrations/testing";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

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

  /** Uploads a file as the branding screen does (a link, the PUT to storage, the confirm): the confirm's answer. */
  async function uploadLogo(jar: CookieJar, body: Uint8Array, fileName = "Logo.png"): Promise<Response> {
    const { attachmentId, upload } = await dataOf<LogoUpload>(
      await mutate(
        server,
        "organization.logo.requestUpload",
        { fileName, contentType: "image/png", sizeBytes: body.byteLength },
        jar,
      ),
    );
    // Storage checks only the size and the declared type.
    await storage.upload({ ...upload, expiresAt: new Date(upload.expiresAt) }, body, "image/png");
    return mutate(server, "organization.logo.confirmUpload", { attachmentId }, jar);
  }

  const uploadedLogo = async (jar: CookieJar, fileName?: string) =>
    dataOf<OrganizationLogo>(await uploadLogo(jar, tinyPng, fileName));

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

  it("makes the logo the upload that arrived last, when two overlap", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    const requested = async (fileName: string) => {
      const { attachmentId, upload } = await dataOf<LogoUpload>(
        await mutate(
          server,
          "organization.logo.requestUpload",
          { fileName, contentType: "image/png", sizeBytes: tinyPng.byteLength },
          jar,
        ),
      );
      await storage.upload({ ...upload, expiresAt: new Date(upload.expiresAt) }, tinyPng, "image/png");
      return attachmentId;
    };
    const slow = await requested("Slow.png");
    const quick = await requested("Quick.png");
    await dataOf(await mutate(server, "organization.logo.confirmUpload", { attachmentId: quick }, jar));
    const arrivedLast = await dataOf<OrganizationLogo>(
      await mutate(server, "organization.logo.confirmUpload", { attachmentId: slow }, jar),
    );
    // What the screen shows after its upload, the api's logo too.
    expect(await dataOf<OrganizationLogo>(await query(server, "organization.logo.get", jar))).toMatchObject({
      attachmentId: arrivedLast.attachmentId,
    });
  });

  it("refuses a file of more pixels than a logo may hold, as a bomb, or that isn't the image it says", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    const bomb = pngOfSize(8000, 8000);
    // A few kilobytes for 64 million pixels, which the worker would inflate into gigabytes for every PDF.
    expect(bomb.byteLength).toBeLessThan(16 * 1024);
    for (const body of [bomb, pngOfSize(4097, 1)]) {
      expect(await refusalOf(await uploadLogo(jar, body))).toEqual({ status: 400, reason: "LOGO_TOO_LARGE" });
    }
    // A renamed file; a second IHDR of 20000×20000, which png-js decodes; a megabyte of pixel data for 16×16; a row
    // with filter type 5 and a narrow interlaced file, at which png-js throws in the worker where nothing catches it.
    const renamed = new TextEncoder().encode("GIF89a, renamed");
    const unreadable = [
      pngWithSecondHeader(),
      pngWithOversizedPixelData(),
      pngWithFilterType(5),
      narrowInterlacedPng(),
    ];
    for (const body of [renamed, ...unreadable]) {
      expect(await refusalOf(await uploadLogo(jar, body))).toEqual({ status: 400, reason: "UPLOAD_DOES_NOT_MATCH" });
    }
    expect(await dataOf(await query(server, "organization.logo.get", jar))).toBeNull();
    // 16 million pixels, the most a logo may hold.
    expect((await uploadLogo(jar, pngOfSize(4000, 4000))).status).toBe(200);
  });

  it("confirms and removes only the organization's logos, never another of its files", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    const licence = await server.files.storeGeneratedFile(systemActor(agency.organizationId), {
      recordType: "organization",
      recordId: agency.organizationId,
      fileName: "Licence.png",
      contentType: "image/png",
      body: tinyPng,
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
