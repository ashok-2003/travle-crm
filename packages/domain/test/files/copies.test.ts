// A file attached to another record without storing it again: a ready file of its own there that shares the stored bytes,
// adds nothing to the organization's storage, is allowed when storage is full, names the first holder when copied again,
// and is made once when asked for twice.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bytesStored } from "../../src/files/index.js";
import { systemActor } from "../../src/kernel/index.js";
import {
  bytes,
  createOrganization,
  createTestFiles,
  memberOf,
  passportUpload,
  ref,
  type TestFiles,
} from "./test-files.js";

const target = { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000f9" };

describe("copying a file onto another record", () => {
  let test: TestFiles;
  let organizationId: string;
  beforeAll(async () => {
    test = createTestFiles();
    organizationId = await createOrganization(test);
  });
  afterAll(() => test.close());

  async function stored(organization: string, files = test) {
    const sales = memberOf(organization, "sales");
    const { attachment, upload } = await files.files.requestUpload(sales, passportUpload());
    await files.storage.upload(upload, bytes("%PDF-passpt"), "application/pdf");
    await files.files.confirmUpload(sales, ref(attachment));
    return { sales, source: attachment };
  }

  const used = (organization = organizationId, files = test) =>
    files.db.forOrg(organization, (tx) => bytesStored(tx, organization));
  const storedAsOf = (id: string) =>
    test.db.forOrg(organizationId, async (tx) => (await tx.attachment.findUniqueOrThrow({ where: { id } })).storedAsId);

  it("makes a ready file of its own on the other record, sharing the stored bytes and adding none", async () => {
    const { sales, source } = await stored(organizationId);
    const objects = test.storage.objects.size;
    const before = await used();
    const copy = await test.files.copyFile(sales, ref(source), target);
    expect(copy).toMatchObject({ ...target, fileName: source.fileName, status: "ready", sizeBytes: source.sizeBytes });
    expect(copy.id).not.toBe(source.id);
    expect(await storedAsOf(copy.id)).toBe(source.id);
    expect(test.storage.objects.size).toBe(objects);
    expect(await used()).toBe(before);
    expect((await test.files.list(sales, target)).map((file) => file.id)).toContain(copy.id);
  });

  it("names the first file's holder when a copy is copied again: never a chain", async () => {
    const { sales, source } = await stored(organizationId);
    const first = await test.files.copyFile(sales, ref(source), {
      recordType: "lead",
      recordId: "0199e7a0-0000-7000-8000-0000000000ff",
    });
    const second = await test.files.copyFile(sales, ref(first), {
      recordType: "lead",
      recordId: "0199e7a0-0000-7000-8000-0000000000fc",
    });
    expect(await storedAsOf(second.id)).toBe(source.id);
  });

  it("refuses a file that is not there, or one named under another record", async () => {
    const { sales, source } = await stored(organizationId);
    await expect(
      test.files.copyFile(sales, { ...ref(source), recordId: target.recordId }, target),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("makes one copy when the same copy is asked for twice", async () => {
    const { sales, source } = await stored(organizationId);
    const record = { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000fa" };
    const first = await test.files.copyFile(sales, ref(source), record);
    const again = await test.files.copyFile(sales, ref(source), record);
    expect(again.id).toBe(first.id);
  });

  it("finishes a copy that the copy in storage of before left pending, as a copy sharing the bytes", async () => {
    const { sales, source } = await stored(organizationId);
    const record = { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000fb" };
    // What the old copy wrote before storage failed it: a pending row of the same file on the record.
    const pending = await test.db.forOrg(organizationId, (tx) =>
      tx.attachment.create({
        data: { ...record, fileName: source.fileName, contentType: source.contentType, sizeBytes: source.sizeBytes },
      }),
    );
    const done = await test.files.copyFile(sales, ref(source), record);
    expect(done).toMatchObject({ id: pending.id, status: "ready" });
    expect(await storedAsOf(pending.id)).toBe(source.id);
    const rows = await test.db.forOrg(organizationId, (tx) => tx.attachment.findMany({ where: record }));
    expect(rows).toHaveLength(1);
  });

  it("copies even when the organization's storage is full: a copy stores nothing", async () => {
    const limited = createTestFiles({ storageLimitBytes: 15 });
    try {
      const other = await createOrganization(limited, "Small agency");
      const { sales, source } = await stored(other, limited);
      await expect(limited.files.copyFile(sales, ref(source), target)).resolves.toMatchObject({ status: "ready" });
      const another = { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000fe" };
      await expect(
        limited.db.forOrg(other, (tx) => limited.files.copyFileIn(tx, systemActor(other), ref(source), another)),
      ).resolves.toMatchObject({ status: "ready" });
      expect(await used(other, limited)).toBe(source.sizeBytes);
    } finally {
      await limited.close();
    }
  });

  it("goes with the transaction it was made in, when that rolls back", async () => {
    const { source } = await stored(organizationId);
    const record = { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000fd" };
    await expect(
      test.db.forOrg(organizationId, async (tx) => {
        await test.files.copyFileIn(tx, systemActor(organizationId), ref(source), record);
        throw new Error("the turn failed later on");
      }),
    ).rejects.toThrow(/later on/);
    expect(await test.db.forOrg(organizationId, (tx) => tx.attachment.count({ where: record }))).toBe(0);
  });
});
