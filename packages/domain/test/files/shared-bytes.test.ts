// A file stored once and attached again behaves in every way as if it had its own copy: every read finds the holder's
// bytes, removing the holder leaves it readable, its own erasure never deletes the holder's bytes, the holder's erasure
// hands the bytes on to a copy that stays, and an organization's purge deletes them all.
import { createPlatformDatabase, deleteOrganizationRows, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  bytesStored,
  deleteQueuedFile,
  deleteRecordFiles,
  dueFileDeletions,
  exportedFiles,
  storedFiles,
} from "../../src/files/index.js";
import { OWNER_ROLE_KEY } from "../../src/identity/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { bytes, createOrganization, createTestFiles, memberOf, ref, type TestFiles } from "./test-files.js";

const record = (recordId: string) => ({ recordType: "lead", recordId });

describe("a file stored once and shared", () => {
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

  const keyOf = (organizationId: string, id: string) => `organizations/${organizationId}/attachments/${id}`;

  /** A brochure stored on one lead, then attached to others the way a send attaches it to its message. */
  async function shared(recordIds: string[]) {
    const organizationId = await createOrganization(test);
    const system = systemActor(organizationId);
    const [first = "", ...others] = recordIds;
    const holder = await test.files.storeGeneratedFile(system, {
      ...record(first),
      fileName: "Spiti brochure.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-spiti"),
    });
    const copies = [];
    for (const recordId of others) copies.push(await test.files.copyFile(system, ref(holder), record(recordId)));
    return { organizationId, holder, copies };
  }

  /** A copy on the holder's own record, as the clean-up makes of the same file uploaded twice to it. */
  const copyOnSameRecord = (organizationId: string, holder: { id: string; recordId: string }) =>
    test.db.forOrg(organizationId, (tx) =>
      tx.attachment.create({
        data: {
          ...record(holder.recordId),
          fileName: "Spiti brochure.pdf",
          contentType: "application/pdf",
          sizeBytes: 10,
          status: "ready",
          confirmedAt: new Date(),
          storedAsId: holder.id,
        },
      }),
    );

  const storedAsOf = (organizationId: string, id: string) =>
    test.platform.attachment.findUniqueOrThrow({ where: { id } }).then((row) => row.storedAsId);

  /** Runs the deletions' outbox for the organization, as the console's job does. */
  async function emptyOutbox(organizationId: string) {
    const now = new Date();
    const due = await platformDb.transaction((tx) => dueFileDeletions(tx, { now, limit: 50, organizationId }));
    for (const deletion of due) await deleteQueuedFile(test.storage, deletion);
    return due.map((deletion) => deletion.attachmentId);
  }

  it("reads a copy's bytes from the file holding them: links, system links, the bytes and exports", async () => {
    const lead = "0199e7a0-0000-7000-8000-00000000e001";
    const { organizationId, holder, copies } = await shared(["0199e7a0-0000-7000-8000-00000000e000", lead]);
    const [copy] = copies;
    if (copy === undefined) throw new Error("no copy");
    const holderKey = encodeURIComponent(keyOf(organizationId, holder.id));
    expect(test.storage.objects.has(keyOf(organizationId, copy.id))).toBe(false);

    const member = memberOf(organizationId, OWNER_ROLE_KEY);
    expect((await test.files.downloadLink(member, ref(copy))).url).toContain(holderKey);
    expect((await test.files.systemDownloadLink(organizationId, { attachmentId: copy.id })).url).toContain(holderKey);
    const file = await test.files.systemFile(organizationId, ref(copy));
    expect(new TextDecoder().decode(file.body)).toBe("%PDF-spiti");

    const exported = await platformDb.transaction((tx) =>
      exportedFiles(tx, test.storage, { organizationId, ...record(lead) }, 60),
    );
    expect(exported.map((file) => file.id)).toEqual([copy.id]);
    expect(exported[0]?.downloadUrl).toContain(holderKey);
    const everyFile = await platformDb.transaction((tx) => storedFiles(tx, organizationId));
    expect(everyFile).toContainEqual({ attachmentId: copy.id, key: keyOf(organizationId, holder.id) });
  });

  it("keeps a copy readable when the file holding its bytes is removed, and counts the bytes once", async () => {
    const { organizationId, holder, copies } = await shared([
      "0199e7a0-0000-7000-8000-00000000e010",
      "0199e7a0-0000-7000-8000-00000000e011",
      "0199e7a0-0000-7000-8000-00000000e012",
    ]);
    await test.files.remove(memberOf(organizationId, OWNER_ROLE_KEY), ref(holder));
    for (const copy of copies) {
      expect((await test.files.systemFile(organizationId, ref(copy))).body.byteLength).toBe(holder.sizeBytes);
    }
    // A removed file's bytes count until a purge, as always; the copies add none.
    expect(await test.db.forOrg(organizationId, (tx) => bytesStored(tx, organizationId))).toBe(holder.sizeBytes);
  });

  it("deletes a copy's row on erasure and never queues its holder's bytes", async () => {
    const lead = "0199e7a0-0000-7000-8000-00000000e021";
    const { organizationId, holder, copies } = await shared(["0199e7a0-0000-7000-8000-00000000e020", lead]);
    const erased = { organizationId, ...record(lead) };
    expect(await platformDb.transaction((tx) => deleteRecordFiles(tx, test.storage, erased, new Date()))).toBe(1);
    expect(await emptyOutbox(organizationId)).toEqual(copies.map((copy) => copy.id));
    expect(test.storage.objects.has(keyOf(organizationId, holder.id))).toBe(true);
    expect((await test.files.systemFile(organizationId, ref(holder))).body.byteLength).toBe(holder.sizeBytes);
  });

  it("hands the bytes of an erased file on to the oldest copy staying, which the others then name", async () => {
    const erasedLead = "0199e7a0-0000-7000-8000-00000000e030";
    const { organizationId, holder, copies } = await shared([
      erasedLead,
      "0199e7a0-0000-7000-8000-00000000e031",
      "0199e7a0-0000-7000-8000-00000000e032",
    ]);
    const [heir, other] = copies;
    if (heir === undefined || other === undefined) throw new Error("no copies");
    // A copy on the erased record itself goes with it, and takes nothing over.
    const sameRecord = await copyOnSameRecord(organizationId, holder);
    const erased = { organizationId, ...record(erasedLead) };
    expect(await platformDb.transaction((tx) => deleteRecordFiles(tx, test.storage, erased, new Date()))).toBe(2);
    expect(await storedAsOf(organizationId, heir.id)).toBeNull();
    expect(await storedAsOf(organizationId, other.id)).toBe(heir.id);
    expect((await emptyOutbox(organizationId)).sort()).toEqual([holder.id, sameRecord.id].sort());
    expect(test.storage.objects.has(keyOf(organizationId, holder.id))).toBe(false);
    for (const copy of [heir, other]) {
      const file = await test.files.systemFile(organizationId, ref(copy));
      expect(new TextDecoder().decode(file.body)).toBe("%PDF-spiti");
    }
    expect(await test.db.forOrg(organizationId, (tx) => bytesStored(tx, organizationId))).toBe(holder.sizeBytes);
  });

  it("deletes a holder and the copies on its own record together, handing nothing on", async () => {
    const lead = "0199e7a0-0000-7000-8000-00000000e040";
    const { organizationId, holder } = await shared([lead]);
    await copyOnSameRecord(organizationId, holder);
    const objects = test.storage.objects.size;
    const erased = { organizationId, ...record(lead) };
    expect(await platformDb.transaction((tx) => deleteRecordFiles(tx, test.storage, erased, new Date()))).toBe(2);
    expect(await test.platform.attachment.count({ where: { organizationId } })).toBe(0);
    expect(test.storage.objects.size).toBe(objects);
  });

  it("purges an organization's rows that share bytes in one go", async () => {
    const { organizationId } = await shared([
      "0199e7a0-0000-7000-8000-00000000e050",
      "0199e7a0-0000-7000-8000-00000000e051",
    ]);
    await platformDb.transaction((tx) => deleteOrganizationRows(tx, organizationId));
    expect(await test.platform.attachment.count({ where: { organizationId } })).toBe(0);
  });
});
