// A file the server makes or downloads is stored once: the same bytes (size and SHA-256) the organization already keeps on a
// live file become a file sharing that one's object, adding nothing to storage; other bytes, other organizations, removed
// files and short-lived files are stored apart; a retry under a chosen id is still one row; and a holder's hash goes
// with its bytes when an erasure hands them on.
import { createHash, randomUUID } from "node:crypto";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { bytesStored, DATA_EXPORT_RECORD_TYPE, deleteRecordFiles } from "../../src/files/index.js";
import { OWNER_ROLE_KEY } from "../../src/identity/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { bytes, createOrganization, createTestFiles, memberOf, ref, type TestFiles } from "./test-files.js";

const message = (recordId: string) => ({ recordType: "whatsapp_message", recordId });

describe("storing a generated file once", () => {
  let test: TestFiles;
  let platformDb: PlatformDatabase;

  beforeAll(() => {
    test = createTestFiles();
    platformDb = createPlatformDatabase(inject("dbUrls").platform, { maxConnections: 2 });
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
  });

  const brochure = "%PDF-spiti brochure";
  const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

  /** The file, as the media job stores a WhatsApp file: on its message, under the message's id. */
  const store = (
    organizationId: string,
    recordId: string,
    body = brochure,
    overrides: { fileName?: string; recordType?: string } = {},
  ) =>
    test.files.storeGeneratedFile(systemActor(organizationId), {
      ...message(recordId),
      fileName: "IMG-2026.pdf",
      contentType: "application/pdf",
      body: bytes(body),
      attachmentId: recordId,
      ...overrides,
    });

  const rowOf = (id: string) => test.platform.attachment.findUniqueOrThrow({ where: { id } });
  const used = (organizationId: string) => test.db.forOrg(organizationId, (tx) => bytesStored(tx, organizationId));

  it("shares the object of a file already holding the same bytes, under any name, and adds nothing", async () => {
    const organizationId = await createOrganization(test);
    const first = await store(organizationId, "0199e7a0-0000-7000-8000-00000000d001");
    const objects = test.storage.objects.size;
    const before = await used(organizationId);
    const again = await store(organizationId, "0199e7a0-0000-7000-8000-00000000d002", brochure, {
      fileName: "Spiti (1).pdf",
    });
    expect(again).toMatchObject({ status: "ready", fileName: "Spiti (1).pdf", sizeBytes: first.sizeBytes });
    expect(await rowOf(first.id)).toMatchObject({ storedAsId: null, contentSha256: sha256(brochure) });
    expect(await rowOf(again.id)).toMatchObject({ storedAsId: first.id, contentSha256: null });
    expect(test.storage.objects.size).toBe(objects);
    expect(await used(organizationId)).toBe(before);
    const file = await test.files.systemFile(organizationId, ref(again));
    expect(new TextDecoder().decode(file.body)).toBe(brochure);
  });

  it("stores apart other bytes of the same size, another organization's same bytes, and a removed file's", async () => {
    const organizationId = await createOrganization(test);
    const first = await store(organizationId, "0199e7a0-0000-7000-8000-00000000d011");
    const sameSize = await store(organizationId, "0199e7a0-0000-7000-8000-00000000d012", "%PDF-ladak brochure");
    const elsewhere = await createOrganization(test, "Other agency");
    const theirs = await store(elsewhere, "0199e7a0-0000-7000-8000-00000000d013");
    await test.files.remove(memberOf(organizationId, OWNER_ROLE_KEY), ref(first));
    const afterRemoval = await store(organizationId, "0199e7a0-0000-7000-8000-00000000d014");
    for (const file of [sameSize, theirs, afterRemoval]) expect((await rowOf(file.id)).storedAsId).toBeNull();
  });

  it("stores a short-lived file apart, and keeps no hash for it", async () => {
    const organizationId = await createOrganization(test);
    const exportFile = () =>
      test.files.storeGeneratedFile(systemActor(organizationId), {
        recordType: DATA_EXPORT_RECORD_TYPE,
        recordId: randomUUID(),
        fileName: "leads.csv",
        contentType: "text/csv",
        body: bytes("name,phone"),
      });
    const first = await exportFile();
    const second = await exportFile();
    expect(await rowOf(first.id)).toMatchObject({ storedAsId: null, contentSha256: null });
    expect(await rowOf(second.id)).toMatchObject({ storedAsId: null, contentSha256: null });
  });

  it("is one row when the media job tries again under the message's id, before or after a failed first try", async () => {
    const organizationId = await createOrganization(test);
    await store(organizationId, "0199e7a0-0000-7000-8000-00000000d031");
    const id = "0199e7a0-0000-7000-8000-00000000d032";
    const once = await store(organizationId, id);
    const twice = await store(organizationId, id);
    expect(twice.id).toBe(once.id);
    // A first try that stored its bytes and failed before marking its row ready: the retry stores them under the row's own
    // key again, a holder, so no object is left that no file reads.
    const failedId = "0199e7a0-0000-7000-8000-00000000d033";
    await test.db.forOrg(organizationId, (tx) =>
      tx.attachment.create({
        data: {
          id: failedId,
          ...message(failedId),
          fileName: "IMG-2026.pdf",
          contentType: "application/pdf",
          sizeBytes: 19,
        },
      }),
    );
    const ownKey = `organizations/${organizationId}/attachments/${failedId}`;
    await test.storage.put({ key: ownKey, contentType: "application/pdf", body: bytes(brochure) });
    expect(await store(organizationId, failedId)).toMatchObject({ id: failedId, status: "ready" });
    expect(await rowOf(failedId)).toMatchObject({ storedAsId: null, contentSha256: sha256(brochure) });
    expect(new TextDecoder().decode((await test.storage.get(ownKey)) ?? undefined)).toBe(brochure);
  });

  it("hands the hash on with the bytes, so the same file stored after an erasure still finds them", async () => {
    const organizationId = await createOrganization(test);
    const holder = await store(organizationId, "0199e7a0-0000-7000-8000-00000000d041");
    const heir = await store(organizationId, "0199e7a0-0000-7000-8000-00000000d042");
    const erased = { organizationId, ...message(holder.recordId) };
    await platformDb.transaction((tx) => deleteRecordFiles(tx, test.storage, erased, new Date()));
    expect(await rowOf(heir.id)).toMatchObject({ storedAsId: null, contentSha256: sha256(brochure) });
    const later = await store(organizationId, "0199e7a0-0000-7000-8000-00000000d043");
    expect((await rowOf(later.id)).storedAsId).toBe(heir.id);
  });
});
