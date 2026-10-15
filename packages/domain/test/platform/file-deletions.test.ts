// The console's job that empties the deletions' outbox (ADR 0022): it deletes each due file, then its row, and one file
// storage refuses holds up no other: its row stays for the next run, and the run fails so the job is retried.
import { randomUUID } from "node:crypto";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { deleteDueFiles } from "../../src/platform/file-deletions.js";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

describe("deleting the queued files", () => {
  let test: TestPlatform;
  let platform: PlatformClient;

  beforeAll(() => {
    test = createTestPlatform();
    platform = createPlatformClient(inject("dbUrls").platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
    await test.close();
  });

  it("deletes every file it can, keeps the rows of those storage refused, and fails the run", async () => {
    // The outbox outlives its organization, so these need none: ids are all it holds.
    const organizationId = randomUUID();
    const files = [randomUUID(), randomUUID(), randomUUID()];
    const keyOf = (id: string) => `organizations/${organizationId}/attachments/${id}`;
    const now = new Date();
    for (const id of files) {
      await test.storage.put({ key: keyOf(id), contentType: "application/pdf", body: new Uint8Array([1]) });
    }
    await platform.storedFileDeletion.createMany({
      data: files.map((attachmentId) => ({ targetOrganizationId: organizationId, attachmentId, dueAt: now })),
    });
    // Storage refuses the first file only, as an object lock on one key would.
    const refused = keyOf(files[0] ?? "");
    const services = {
      ...test.services,
      storage: {
        ...test.storage,
        delete: (key: string) =>
          key === refused ? Promise.reject(new Error("AccessDenied")) : test.storage.delete(key),
      },
    };

    await expect(deleteDueFiles(services, { now, organizationId })).rejects.toMatchObject({
      name: "FileDeletionsFailedError",
      message: "1 queued file deletions failed and 2 finished",
    });
    expect([...test.storage.objects.keys()].filter((key) => key.includes(organizationId))).toEqual([refused]);
    expect(
      await platform.storedFileDeletion.findMany({
        where: { targetOrganizationId: organizationId },
        select: { attachmentId: true },
      }),
    ).toEqual([{ attachmentId: files[0] }]);

    // A later run, once storage lets it, finishes.
    expect(await deleteDueFiles(test.services, { now, organizationId })).toBe(1);
    expect(await platform.storedFileDeletion.count({ where: { targetOrganizationId: organizationId } })).toBe(0);
  });
});
