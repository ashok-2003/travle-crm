// A package's brochures and payment QR against the real database and in-memory storage: up to five brochures (PDF or
// pictures), one payment QR picture that a new confirmed one replaces, and files that stay with their own package.
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
  async function upload(packageId: string, kind: "brochure" | "payment_qr", contentType = "application/pdf") {
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
  async function add(
    packageId: string,
    kind: "brochure" | "payment_qr",
    contentType = kind === "brochure" ? "application/pdf" : "image/png",
  ) {
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

  it("keeps up to five brochures", async () => {
    const packageId = await aPackage();
    for (let count = 0; count < 5; count += 1)
      await add(packageId, "brochure", count === 1 ? "image/jpeg" : "application/pdf");
    const listed = await listPackageFiles(dependencies, world.manager, packageId);
    expect(listed.brochures).toHaveLength(5);
    expect(listed.brochures[0]).toMatchObject({ contentType: "application/pdf" });
    expect(listed.brochures[0]?.url).toEqual(expect.any(String));
    expect(listed.paymentQr).toBeNull();

    const first = listed.brochures[0]?.attachmentId ?? "";
    await removePackageFile(dependencies, world.manager, { packageId, kind: "brochure", attachmentId: first });
    expect((await listPackageFiles(dependencies, world.manager, packageId)).brochures).toHaveLength(4);
  });

  it("a new payment QR replaces the old one", async () => {
    const packageId = await aPackage();
    const old = await add(packageId, "payment_qr");
    // An unconfirmed new upload never deletes the old one.
    await requestPackageFileUpload(dependencies, world.manager, {
      packageId,
      kind: "payment_qr",
      fileName: "new.png",
      contentType: "image/png",
      sizeBytes: 8,
    });
    expect((await listPackageFiles(dependencies, world.manager, packageId)).paymentQr?.attachmentId).toBe(old);

    const fresh = await add(packageId, "payment_qr", "image/webp");
    const listed = await listPackageFiles(dependencies, world.manager, packageId);
    expect(listed.paymentQr).toMatchObject({ attachmentId: fresh, contentType: "image/webp" });
    expect(
      await dependencies.files.list(world.manager, { recordType: "package_payment_qr", recordId: packageId }),
    ).toHaveLength(1);
  });

  it("audits the payment QR coming, being replaced and going, but not a brochure", async () => {
    const packageId = await aPackage();
    const first = await add(packageId, "payment_qr");
    const second = await add(packageId, "payment_qr", "image/webp");
    await removePackageFile(dependencies, world.manager, { packageId, kind: "payment_qr", attachmentId: second });
    await add(packageId, "brochure");
    const entries = await world.inOrg((tx) =>
      tx.auditEntry.findMany({
        where: { entityId: packageId, action: "package.payment-changed" },
        orderBy: { occurredAt: "asc" },
      }),
    );
    expect(entries.map((entry) => [entry.before, entry.after])).toEqual([
      [null, { qrAttachmentId: first }],
      [{ qrAttachmentId: first }, { qrAttachmentId: second }],
      [{ qrAttachmentId: second }, null],
    ]);
  });

  it("refuses a PDF as the QR and a sixth brochure", async () => {
    const packageId = await aPackage();
    const request = (kind: "brochure" | "payment_qr", contentType: string, sizeBytes = 8) =>
      reasonOf(
        requestPackageFileUpload(dependencies, world.manager, {
          packageId,
          kind,
          fileName: "f",
          contentType: contentType as "image/png",
          sizeBytes,
        }),
      );
    expect(await request("payment_qr", "application/pdf")).toBe("CONTENT_TYPE_NOT_ALLOWED");
    expect(await request("payment_qr", "image/png", 2 * 1024 * 1024 + 1)).toBe("ATTACHMENT_TOO_BIG");
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

  it("shows the newest QR when two are ready, and the next confirmation leaves only the newest", async () => {
    const packageId = await aPackage();
    // Two ready QRs, as after a replacement whose removal failed: both confirmed straight through the files service.
    const first = await upload(packageId, "payment_qr", "image/png");
    const second = await upload(packageId, "payment_qr", "image/png");
    const record = { recordType: "package_payment_qr", recordId: packageId };
    await dependencies.files.confirmUpload(world.manager, { ...record, attachmentId: first });
    await dependencies.files.confirmUpload(world.manager, { ...record, attachmentId: second });
    expect((await listPackageFiles(dependencies, world.manager, packageId)).paymentQr?.attachmentId).toBe(second);

    const third = await add(packageId, "payment_qr");
    expect((await listPackageFiles(dependencies, world.manager, packageId)).paymentQr?.attachmentId).toBe(third);
    expect(await dependencies.files.list(world.manager, record)).toHaveLength(1);
  });
});
