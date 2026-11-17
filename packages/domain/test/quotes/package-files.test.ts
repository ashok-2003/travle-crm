// A package's brochures against the real database and in-memory storage: up to five brochures (PDF or
// pictures), and files that stay with their own package.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  confirmPackageFile,
  listPackageFiles,
  removePackageFile,
  requestPackageFileUpload,
  type PackageFileDependencies,
} from "../../src/quotes/index.js";
import { createFiles } from "../../src/files/index.js";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { openWorld, type World } from "../bookings/support.js";

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("a package's files", () => {
  let world: World;
  let dependencies: PackageFileDependencies;
  const storage = createMemoryStorage();
  let counter = 0;

  beforeAll(async () => {
    world = await openWorld("Package files agency");
    dependencies = { db: world.db, files: createFiles({ db: world.db, storage }) };
  });
  afterAll(async () => {
    await world.close();
  });

  async function aPackage() {
    counter += 1;
    const row = await world.inOrg((tx) =>
      tx.quoteTemplate.create({
        data: {
          name: `Files package ${String(counter)}`,
          title: "Trip",
          days: [],
          items: [],
          inclusions: "",
          exclusions: "",
          notes: "",
          taxRateBasisPoints: 500,
          createdBy: world.manager.userId,
        },
        select: { id: true },
      }),
    );
    return row.id;
  }

  /** Requests and uploads a file but leaves it unconfirmed. */
  async function upload(packageId: string, kind: "brochure", contentType = "application/pdf") {
    const { attachmentId, upload: target } = await requestPackageFileUpload(dependencies, world.manager, {
      packageId,
      kind,
      fileName: `${kind}-pending`,
      contentType: contentType as "application/pdf",
      sizeBytes: 8,
    });
    await storage.upload(
      { ...target, expiresAt: new Date(target.expiresAt) },
      new TextEncoder().encode("12345678"),
      contentType,
    );
    return attachmentId;
  }

  /** Requests, uploads and confirms a file, as the browser does. */
  async function add(packageId: string, kind: "brochure", contentType = "application/pdf") {
    const { attachmentId, upload } = await requestPackageFileUpload(dependencies, world.manager, {
      packageId,
      kind,
      fileName: `${kind}-${contentType.split("/")[1] ?? "x"}`,
      contentType: contentType as "application/pdf",
      sizeBytes: 8,
    });
    await storage.upload(
      { ...upload, expiresAt: new Date(upload.expiresAt) },
      new TextEncoder().encode("12345678"),
      contentType,
    );
    await confirmPackageFile(dependencies, world.manager, { packageId, kind, attachmentId });
    return attachmentId;
  }

  it("a package's files are its brochures and photos: no payment picture", async () => {
    const packageId = await aPackage();
    expect(Object.keys(await listPackageFiles(dependencies, world.manager, packageId))).toEqual(["brochures"]);
  });

  it("keeps up to five brochures", async () => {
    const packageId = await aPackage();
    for (let count = 0; count < 5; count += 1)
      await add(packageId, "brochure", count === 1 ? "image/jpeg" : "application/pdf");
    const listed = await listPackageFiles(dependencies, world.manager, packageId);
    expect(listed.brochures).toHaveLength(5);
    expect(listed.brochures[0]).toMatchObject({ contentType: "application/pdf" });
    expect(listed.brochures[0]?.url).toEqual(expect.any(String));

    const first = listed.brochures[0]?.attachmentId ?? "";
    await removePackageFile(dependencies, world.manager, { packageId, kind: "brochure", attachmentId: first });
    expect((await listPackageFiles(dependencies, world.manager, packageId)).brochures).toHaveLength(4);
  });

  it("refuses an oversize brochure and a sixth brochure", async () => {
    const packageId = await aPackage();
    const request = (kind: "brochure", contentType: string, sizeBytes = 8) =>
      reasonOf(
        requestPackageFileUpload(dependencies, world.manager, {
          packageId,
          kind,
          fileName: "f",
          contentType: contentType as "image/png",
          sizeBytes,
        }),
      );
    expect(await request("brochure", "application/pdf", 10 * 1024 * 1024 + 1)).toBe("ATTACHMENT_TOO_BIG");
    for (let count = 0; count < 5; count += 1) await add(packageId, "brochure");
    expect(await request("brochure", "application/pdf")).toBe("PACKAGE_BROCHURE_LIMIT");
  });

  it("keeps a file with its own package", async () => {
    const mine = await aPackage();
    const other = await aPackage();
    const attachmentId = await add(mine, "brochure");
    expect(
      await reasonOf(
        removePackageFile(dependencies, world.manager, { packageId: other, kind: "brochure", attachmentId }),
      ),
    ).not.toBeNull();
    expect(
      await reasonOf(
        confirmPackageFile(dependencies, world.manager, { packageId: other, kind: "brochure", attachmentId }),
      ),
    ).not.toBeNull();
    expect((await listPackageFiles(dependencies, world.manager, mine)).brochures).toHaveLength(1);
    expect(await reasonOf(listPackageFiles(dependencies, world.manager, "0199e7a0-0000-7000-8000-0000000000aa"))).toBe(
      "NOT_FOUND",
    );
  });

  it("holds five brochures even when six were requested before any was confirmed", async () => {
    const packageId = await aPackage();
    const pending: string[] = [];
    for (let count = 0; count < 6; count += 1) pending.push(await upload(packageId, "brochure"));
    for (const attachmentId of pending.slice(0, 5)) {
      await confirmPackageFile(dependencies, world.manager, { packageId, kind: "brochure", attachmentId });
    }
    const sixth = pending[5] ?? "";
    expect(
      await reasonOf(
        confirmPackageFile(dependencies, world.manager, { packageId, kind: "brochure", attachmentId: sixth }),
      ),
    ).toBe("PACKAGE_BROCHURE_LIMIT");
    expect((await listPackageFiles(dependencies, world.manager, packageId)).brochures).toHaveLength(5);
    // Confirming one of the five again is still fine.
    await confirmPackageFile(dependencies, world.manager, {
      packageId,
      kind: "brochure",
      attachmentId: pending[0] ?? "",
    });
  });
});
