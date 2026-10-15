// An organization's export as a platform job (spec 5): every table's rows and every person, read a batch at a time and
// stored as JSON lines a part at a time, under the platform's own prefix; "organization.exported" is logged only once
// it is complete, and only then does it count for a purge.
import { randomUUID } from "node:crypto";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { asOrganization } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cancel,
  downloadOrganizationExport,
  EXPIRE_EXPORTS_QUEUE,
  EXPORT_ORGANIZATION_QUEUE,
  listOrganizationExports,
  listPlatformLog,
  onboardOrganization,
  purgeOrganization,
  requestOrganizationExport,
  requestPurge,
  runOrganizationExport,
} from "../../src/platform/index.js";
import { memberAccessOf } from "../identity/test-identity.js";
import { exportLines, exportParts, rowsOf } from "./test-exports.js";
import {
  createTestPlan,
  createTestPlatform,
  onboardingInput,
  support,
  supportUserId,
  type TestPlatform,
} from "./test-platform.js";

/** More audit entries than one batch of the export (500 rows). */
const MANY_ENTRIES = 1_201;

describe("an organization's export", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  /** An onboarded agency with a second person, a stored file, and more audit entries than a batch. */
  async function bigAgency() {
    const input = onboardingInput(plan);
    const { organizationId, ownerMemberId } = await onboardOrganization(test.services, support, input);
    const client = test.identity.database.client;
    const ownerUserId = (await client.member.findUniqueOrThrow({ where: { id: ownerMemberId } })).userId;
    const owner = await memberAccessOf(test.identity.identity, ownerUserId, organizationId);
    await test.identity.identity.staff.create(owner, {
      name: "Ravi",
      email: `ravi-${input.code.toLowerCase()}@example.test`,
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    await test.services.db.forOrg(organizationId, async (tx) => {
      await tx.auditEntry.createMany({
        data: Array.from({ length: MANY_ENTRIES }, () => ({
          source: "job",
          action: "traveller.updated",
          entityType: "traveller",
          entityId: randomUUID(),
        })),
      });
      const file = await tx.attachment.create({
        data: {
          recordType: "traveller",
          recordId: randomUUID(),
          fileName: "Passport.pdf",
          contentType: "application/pdf",
          sizeBytes: 3,
          status: "ready",
          confirmedAt: new Date(),
        },
      });
      await test.storage.put({
        key: `organizations/${organizationId}/attachments/${file.id}`,
        contentType: "application/pdf",
        body: new Uint8Array([1, 2, 3]),
      });
    });
    return { organizationId, code: input.code };
  }

  /** How many rows two of the organization's tables hold (Better Auth's member has no row-level security). */
  async function rowCounts(organizationId: string) {
    return test.services.platformDb.transaction((tx) =>
      asOrganization(tx, organizationId, async (orgTx) => ({
        audit_entry: await orgTx.auditEntry.count({ where: { organizationId } }),
        member: await orgTx.member.count({ where: { organizationId } }),
      })),
    );
  }

  it("is queued when asked for, and counts for a purge only once its job has written it", async () => {
    const { organizationId, code } = await bigAgency();
    await cancel(test.services, support, { organizationId, reason: "Closing down" });
    const requested = await requestOrganizationExport(test.services, support, organizationId);
    expect(requested).toMatchObject({ state: "requested", parts: null, requestedBy: supportUserId });
    expect(test.queue.sent.at(-1)).toMatchObject({
      queue: EXPORT_ORGANIZATION_QUEUE,
      data: { exportId: requested.exportId },
      options: { id: requested.exportId },
    });
    const purge = () => requestPurge(test.services, support, { organizationId, confirmation: code });
    await expect(purge()).rejects.toMatchObject({ reason: "EXPORT_FIRST" });

    await runOrganizationExport(test.services, { exportId: requested.exportId });
    await expect(purge()).resolves.toMatchObject({ jobId: expect.any(String) as string });
    const [done] = await listOrganizationExports(test.services, organizationId);
    expect(done).toMatchObject({ exportId: requested.exportId, state: "done", parts: 1 });
    // Its expiry is queued for when its 7 days are up (and a little after, for the clocks).
    const expiry = test.queue.sent.find((job) => job.queue === EXPIRE_EXPORTS_QUEUE && job.id === requested.exportId);
    expect(expiry?.options.startAfter?.getTime()).toBeGreaterThan(Date.parse(done?.expiresAt ?? ""));
    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 10 }),
    );
    expect(log.entries.map((entry) => entry.action).slice(0, 3)).toEqual([
      "organization.purge-requested",
      "organization.exported",
      "organization.export-requested",
    ]);
    expect(log.entries[1]?.after).toEqual({
      exportId: requested.exportId,
      parts: 1,
      rows: done?.rows,
      people: 2,
      files: 1,
    });
  });

  it("holds every row of every table once, and its people, read more than a batch at a time", async () => {
    const { organizationId } = await bigAgency();
    const requested = await requestOrganizationExport(test.services, support, organizationId);
    await runOrganizationExport(test.services, { exportId: requested.exportId });
    const lines = exportLines(test.storage, requested);
    const rowsOfTable = (table: string) => rowsOf(lines, table);

    const counts = await rowCounts(organizationId);
    expect(counts.audit_entry).toBeGreaterThan(MANY_ENTRIES);
    const auditIds = rowsOfTable("audit_entry").map((row) => row.id);
    expect(auditIds).toHaveLength(counts.audit_entry);
    expect(new Set(auditIds).size).toBe(counts.audit_entry);
    expect(rowsOfTable("organization")).toEqual([expect.objectContaining({ id: organizationId })]);
    expect(rowsOfTable("subscription")).toHaveLength(1);
    expect(rowsOfTable("attachment")).toEqual([expect.objectContaining({ file_name: "Passport.pdf" })]);
    expect(rowsOfTable("member")).toHaveLength(counts.member);
    expect(rowsOfTable("outbox_event")).toEqual([]);
    const people = lines.flatMap((line) => ("person" in line ? [line.person] : []));
    expect(people.map((person) => person.name).sort()).toEqual(["Asha Sharma", "Ravi"]);
    // Nothing of another organization's.
    expect(
      lines.every(
        (line) => !("table" in line) || line.table === "organization" || line.row.organization_id === organizationId,
      ),
    ).toBe(true);
    const [done] = await listOrganizationExports(test.services, organizationId);
    expect(done).toMatchObject({ rows: lines.length - people.length, people: 2 });
  });

  it("stores parts of the size asked for and copies of the files, under the platform's prefix, through a purge", async () => {
    const { organizationId, code } = await bigAgency();
    await cancel(test.services, support, { organizationId, reason: "Closing down" });
    const requested = await requestOrganizationExport(test.services, support, organizationId);
    await runOrganizationExport(test.services, requested, { batchRows: 50, partBytes: 64 * 1024 });
    const parts = exportParts(test.storage, requested);
    const prefix = `platform/exports/${organizationId}/${requested.exportId}/`;
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map(([key]) => key)).toEqual(
      parts.map((_, index) => `${prefix}${String(index + 1).padStart(5, "0")}.jsonl`),
    );
    const [done] = await listOrganizationExports(test.services, organizationId);
    expect(done).toMatchObject({ parts: parts.length, files: 1 });
    const [file] = rowsOf(exportLines(test.storage, requested), "attachment");
    const copyKey = `${prefix}files/${String(file?.id)}`;
    expect(test.storage.objects.get(copyKey)).toMatchObject({ contentType: "application/pdf" });

    await requestPurge(test.services, support, { organizationId, confirmation: code });
    await purgeOrganization(test.services, { organizationId, requestedBy: supportUserId });
    expect([...test.storage.objects.keys()].some((key) => key.startsWith(`organizations/${organizationId}/`))).toBe(
      false,
    );
    expect(exportParts(test.storage, requested)).toHaveLength(parts.length);
    expect(await listOrganizationExports(test.services, organizationId)).toEqual([done]);
    // Still there to download for its 7 days, the file's bytes with it: its own copy, by the file's id.
    const after = await downloadOrganizationExport(test.services, support, requested.exportId);
    expect(after.parts).toHaveLength(parts.length);
    expect(after.files).toEqual([
      { fileId: file?.id, url: expect.stringContaining(encodeURIComponent(copyKey)) as string },
    ]);
    expect([...(test.storage.objects.get(copyKey)?.body ?? [])]).toEqual([1, 2, 3]);
  });
});
