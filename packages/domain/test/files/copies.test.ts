// A file copied onto another record inside storage: a ready file, its own row counted in storage, the limit holding, and the
// same copy asked for twice made once.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bytesStored } from "../../src/files/index.js";
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

  it("makes a ready file of its own on the other record, with the bytes copied inside storage", async () => {
    const { sales, source } = await stored(organizationId);
    const copy = await test.files.copyFile(sales, ref(source), target);
    expect(copy).toMatchObject({ ...target, fileName: source.fileName, status: "ready", sizeBytes: source.sizeBytes });
    expect(copy.id).not.toBe(source.id);
    expect(await test.storage.head(`organizations/${organizationId}/attachments/${copy.id}`)).toMatchObject({
      sizeBytes: 11,
    });
    expect((await test.files.list(sales, target)).map((file) => file.id)).toContain(copy.id);
  });

  it("refuses a file that is not there, or one named under another record", async () => {
    const { sales, source } = await stored(organizationId);
    await expect(
      test.files.copyFile(sales, { ...ref(source), recordId: target.recordId }, target),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("makes one copy when the same copy is asked for twice, and counts it once", async () => {
    const { sales, source } = await stored(organizationId);
    const record = { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000fa" };
    const used = () => test.db.forOrg(organizationId, (tx) => bytesStored(tx, organizationId));
    const before = await used();
    const first = await test.files.copyFile(sales, ref(source), record);
    const again = await test.files.copyFile(sales, ref(source), record);
    expect(again.id).toBe(first.id);
    expect(await used()).toBe(before + source.sizeBytes);
  });

  it("finishes a copy that an earlier try left pending, instead of making a second", async () => {
    const { sales, source } = await stored(organizationId);
    const record = { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000fb" };
    // The first try wrote its row, and storage lost the source for a moment.
    const key = `organizations/${organizationId}/attachments/${source.id}`;
    // The map is read-only to code; a test may reach in to make storage lose the object for a moment.
    const objects = test.storage.objects as Map<string, NonNullable<ReturnType<typeof test.storage.objects.get>>>;
    const object = objects.get(key);
    objects.delete(key);
    await expect(test.files.copyFile(sales, ref(source), record)).rejects.toMatchObject({ code: "NOT_FOUND" });
    if (object !== undefined) objects.set(key, object);
    const done = await test.files.copyFile(sales, ref(source), record);
    expect(done.status).toBe("ready");
    const rows = await test.db.forOrg(organizationId, (tx) => tx.attachment.findMany({ where: record }));
    expect(rows).toHaveLength(1);
  });

  it("holds to the organization's storage limit, as an upload does", async () => {
    const limited = createTestFiles({ storageLimitBytes: 15 });
    try {
      const other = await createOrganization(limited, "Small agency");
      const { sales, source } = await stored(other, limited);
      await expect(limited.files.copyFile(sales, ref(source), target)).rejects.toMatchObject({
        code: "LIMIT_REACHED",
        reason: "STORAGE_LIMIT_REACHED",
      });
    } finally {
      await limited.close();
    }
  });
});
