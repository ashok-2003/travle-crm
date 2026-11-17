// A brochure's name and description against the real database and in-memory storage: reads (null when never
// described), one trimmed line within limits, only for a ready brochure of the package, gone with the brochure, audited.
import { AI_KNOWLEDGE_RECORD_TYPE, PACKAGE_BROCHURE_RECORD_TYPE } from "@travel-crm/contracts/files";
import { describeBrochureInput } from "@travel-crm/contracts/quotes";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFiles } from "../../src/files/index.js";
import {
  attachDraftBrochure,
  brochuresByPackage,
  confirmPackageFile,
  describeBrochure,
  removePackageFile,
  requestPackageFileUpload,
  type PackageFileDependencies,
} from "../../src/quotes/index.js";
import { openWorld, type World } from "../bookings/support.js";

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("a package's brochure words", () => {
  let world: World;
  let dependencies: PackageFileDependencies;
  const storage = createMemoryStorage();
  let counter = 0;

  beforeAll(async () => {
    world = await openWorld("Brochure words agency");
    dependencies = { db: world.db, files: createFiles({ db: world.db, storage }) };
  });
  afterAll(async () => {
    await world.close();
  });

  async function aPackage() {
    counter += 1;
    const row = await world.inOrg((tx) =>
      tx.quoteTemplate.create({
        data: { name: `Brochure package ${String(counter)}`, title: "Trip", createdBy: world.manager.userId },
        select: { id: true },
      }),
    );
    return row.id;
  }

  async function aBrochure(packageId: string, confirm = true) {
    const { attachmentId, upload } = await requestPackageFileUpload(dependencies, world.manager, {
      packageId,
      kind: "brochure",
      fileName: "trip.pdf",
      contentType: "application/pdf",
      sizeBytes: 8,
    });
    await storage.upload(
      { ...upload, expiresAt: new Date(upload.expiresAt) },
      new TextEncoder().encode("12345678"),
      "application/pdf",
    );
    if (confirm) await confirmPackageFile(dependencies, world.manager, { packageId, kind: "brochure", attachmentId });
    return attachmentId;
  }

  const read = (packageId: string) =>
    world.inOrg((tx) => brochuresByPackage(tx, [packageId])).then((found) => found.get(packageId));
  const words = (packageId: string, attachmentId: string, name: string, description = "") =>
    describeBrochureInput.parse({ packageId, attachmentId, name, description });

  it("reads a brochure's name and description, and null for one never described", async () => {
    const packageId = await aPackage();
    const first = await aBrochure(packageId);
    const second = await aBrochure(packageId);
    await describeBrochure(dependencies, world.manager, words(packageId, second, "Spiti 7 nights", "Day by day"));
    expect(await read(packageId)).toEqual([
      { attachmentId: first, name: null, description: null },
      { attachmentId: second, name: "Spiti 7 nights", description: "Day by day" },
    ]);
    expect((await world.inOrg((tx) => brochuresByPackage(tx, ["0199e7a0-0000-7000-8000-0000000000aa"]))).size).toBe(1);
  });

  it("keeps the words in one trimmed line within their limits", () => {
    const parsed = describeBrochureInput.parse({
      packageId: "0199e7a0-0000-7000-8000-0000000000aa",
      attachmentId: "0199e7a0-0000-7000-8000-0000000000bb",
      name: "  Spiti\n\n  7   nights ",
      description: "Line one\nline two  ",
    });
    expect(parsed).toMatchObject({ name: "Spiti 7 nights", description: "Line one line two" });
    const base = { packageId: parsed.packageId, attachmentId: parsed.attachmentId, description: "" };
    expect(describeBrochureInput.safeParse({ ...base, name: "x".repeat(80) }).success).toBe(true);
    expect(describeBrochureInput.safeParse({ ...base, name: "x".repeat(81) }).success).toBe(false);
    expect(describeBrochureInput.safeParse({ ...base, name: " \n " }).success).toBe(false);
    expect(describeBrochureInput.safeParse({ ...base, name: "ok", description: "y".repeat(301) }).success).toBe(false);
  });

  it("refuses words for a file that isn't a ready brochure of the package", async () => {
    const mine = await aPackage();
    const other = await aPackage();
    const pending = await aBrochure(mine, false);
    const ready = await aBrochure(mine);
    const save = (packageId: string, attachmentId: string) =>
      reasonOf(describeBrochure(dependencies, world.manager, words(packageId, attachmentId, "Name")));
    expect(await save(mine, pending)).toBe("BROCHURE_NOT_FOUND");
    expect(await save(other, ready)).toBe("BROCHURE_NOT_FOUND");
    expect(await save(mine, "0199e7a0-0000-7000-8000-0000000000cc")).toBe("BROCHURE_NOT_FOUND");
    expect(await save(mine, ready)).toBeNull();
  });

  it("replaces earlier words rather than adding a second row", async () => {
    const packageId = await aPackage();
    const attachmentId = await aBrochure(packageId);
    await describeBrochure(dependencies, world.manager, words(packageId, attachmentId, "First"));
    await describeBrochure(dependencies, world.manager, words(packageId, attachmentId, "Second", "More"));
    expect(await read(packageId)).toEqual([{ attachmentId, name: "Second", description: "More" }]);
    expect(await world.inOrg((tx) => tx.packageBrochure.count({ where: { attachmentId } }))).toBe(1);
  });

  it("forgets the words when the brochure is removed", async () => {
    const packageId = await aPackage();
    const attachmentId = await aBrochure(packageId);
    await describeBrochure(dependencies, world.manager, words(packageId, attachmentId, "Gone soon"));
    await removePackageFile(dependencies, world.manager, { packageId, kind: "brochure", attachmentId });
    expect(await world.inOrg((tx) => tx.packageBrochure.count({ where: { attachmentId } }))).toBe(0);
    expect(await read(packageId)).toEqual([]);
  });

  it("audits the change with before and after", async () => {
    const packageId = await aPackage();
    const attachmentId = await aBrochure(packageId);
    await describeBrochure(dependencies, world.manager, words(packageId, attachmentId, "One", "First words"));
    await describeBrochure(dependencies, world.manager, words(packageId, attachmentId, "Two", "Next words"));
    const entries = await world.inOrg((tx) =>
      tx.auditEntry.findMany({
        where: { action: "package.brochure-described", entityId: packageId },
        orderBy: { id: "asc" },
        select: { before: true, after: true },
      }),
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]?.before).toBeNull();
    expect(entries[0]?.after).toMatchObject({ attachmentId, name: "One", description: "First words" });
    expect(entries[1]?.before).toMatchObject({ name: "One", description: "First words" });
    expect(entries[1]?.after).toMatchObject({ name: "Two", description: "Next words" });
  });

  it("names a brochure a PDF import copied, when given the words", async () => {
    const packageId = await aPackage();
    const knowledgeId = (
      await world.inOrg((tx) =>
        tx.aiKnowledge.create({
          data: { title: "Spiti PDF", kind: "file", fileName: "spiti.pdf", createdBy: world.manager.userId },
          select: { id: true },
        }),
      )
    ).id;
    const piece = await dependencies.files.requestUpload(world.manager, {
      recordType: AI_KNOWLEDGE_RECORD_TYPE,
      recordId: knowledgeId,
      fileName: "spiti.pdf",
      contentType: "application/pdf",
      sizeBytes: 8,
      sensitive: false,
    });
    await storage.upload(piece.upload, new TextEncoder().encode("12345678"), "application/pdf");
    await dependencies.files.confirmUpload(world.manager, {
      recordType: AI_KNOWLEDGE_RECORD_TYPE,
      recordId: knowledgeId,
      attachmentId: piece.attachment.id,
    });
    await world.inOrg((tx) =>
      tx.aiKnowledge.update({ where: { id: knowledgeId }, data: { attachmentId: piece.attachment.id } }),
    );
    await attachDraftBrochure(dependencies, world.manager, packageId, knowledgeId, {
      name: "Spiti trip",
      description: "From the PDF",
    });
    const held = await dependencies.files.list(world.manager, {
      recordType: PACKAGE_BROCHURE_RECORD_TYPE,
      recordId: packageId,
    });
    expect(await read(packageId)).toEqual([
      { attachmentId: held[0]?.id, name: "Spiti trip", description: "From the PDF" },
    ]);
  });
});
