// The attachment table's own rules: record types, sizes and statuses it accepts, and rows the api never deletes.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { HardDeleteError } from "../src/soft-delete.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const file = {
  recordType: "lead",
  recordId: "0199e7a0-0000-7000-8000-0000000000f2",
  fileName: "passport.pdf",
  contentType: "application/pdf",
  sizeBytes: 1024,
};

describe("attachment table", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Attachments");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("starts pending, and is ready exactly when it has been confirmed", async () => {
    const attachment = await db.forOrg(organizationId, (tx) => tx.attachment.create({ data: file }));
    expect(attachment).toMatchObject({ status: "pending", confirmedAt: null, sensitive: false, organizationId });
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.attachment.update({ where: { id: attachment.id }, data: { status: "ready" } }),
      ),
    ).rejects.toThrow(/attachment_confirmed_when_ready/);
    const ready = await db.forOrg(organizationId, (tx) =>
      tx.attachment.update({ where: { id: attachment.id }, data: { status: "ready", confirmedAt: new Date() } }),
    );
    expect(ready.status).toBe("ready");
  });

  it("refuses unknown statuses, empty files and badly named record types", async () => {
    const create = (data: Partial<typeof file> & { status?: string }) =>
      db.forOrg(organizationId, (tx) => tx.attachment.create({ data: { ...file, ...data } }));
    await expect(create({ status: "uploading" })).rejects.toThrow(/attachment_status_value/);
    await expect(create({ sizeBytes: 0 })).rejects.toThrow(/attachment_size_positive/);
    await expect(create({ recordType: "Issued-Document" })).rejects.toThrow(/attachment_record_type_format/);
  });

  it("is soft-deleted: deletes are refused by the client and by Postgres", async () => {
    const attachment = await db.forOrg(organizationId, (tx) => tx.attachment.create({ data: file }));
    await expect(
      db.forOrg(organizationId, (tx) => tx.attachment.delete({ where: { id: attachment.id } })),
    ).rejects.toBeInstanceOf(HardDeleteError);
    await expect(
      db.forOrg(organizationId, (tx) => tx.$executeRaw`DELETE FROM attachment WHERE id = ${attachment.id}::uuid`),
    ).rejects.toThrow(/permission denied/i);
  });
});
