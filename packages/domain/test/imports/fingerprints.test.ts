// Rows already imported (spec B33, D9): a row's fingerprint is the SHA-256 of its kind and matched values, and the
// rows another import of the agency added are found by it, with the day they were added.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { earlierFingerprints, rowFingerprint } from "../../src/imports/index.js";
import { aBatch, aRow } from "./support/batches.js";
import { anAgency, createTestImports, type TestImports } from "./support/test-imports.js";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("a row's fingerprint", () => {
  let test: TestImports;
  let organizationId: string;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
  });

  afterAll(async () => {
    await test.close();
  });

  it("is the SHA-256 of the kind and the values as read", () => {
    const values = ["Asha", "+919876543210", null, "Goa"];
    expect(rowFingerprint("leads", values)).toHaveLength(32);
    expect(hex(rowFingerprint("leads", values))).toBe(hex(rowFingerprint("leads", [...values])));
    expect(hex(rowFingerprint("leads", values))).not.toBe(hex(rowFingerprint("staff", values)));
    expect(hex(rowFingerprint("leads", ["a", null]))).not.toBe(hex(rowFingerprint("leads", [null, "a"])));
  });

  it("finds a fingerprint another import of the agency added, with its day, and none of this import's own", async () => {
    const startedBy = randomUUID();
    const added = rowFingerprint("leads", ["Asha", "+919876543210"]);
    const merged = rowFingerprint("leads", ["Ravi", "+919876543211"]);
    const notAdded = rowFingerprint("leads", ["Meera", null]);
    const finishedAt = new Date("2026-10-12T06:00:00Z");
    const earlier = await inOrg((tx) => aBatch(tx, { startedBy, status: "done", finishedAt }));
    const current = await inOrg((tx) => aBatch(tx, { startedBy, status: "checking" }));
    await inOrg(async (tx) => {
      await aRow(tx, { batchId: earlier.id, rowNumber: 2, outcome: "added", fingerprint: Uint8Array.from(added) });
      await aRow(tx, { batchId: earlier.id, rowNumber: 3, outcome: "merged", fingerprint: Uint8Array.from(merged) });
      await aRow(tx, { batchId: current.id, rowNumber: 2, outcome: "added", fingerprint: Uint8Array.from(notAdded) });
    });
    const found = await inOrg((tx) => earlierFingerprints(tx, "leads", [added, merged, notAdded], current.id));
    expect(Object.fromEntries(found)).toEqual({ [hex(added)]: finishedAt, [hex(merged)]: finishedAt });
    // Another agency's rows are never this one's.
    const other = await anAgency(test, "Another agency");
    expect((await test.db.forOrg(other, (tx) => earlierFingerprints(tx, "leads", [added], current.id))).size).toBe(0);
    expect((await inOrg((tx) => earlierFingerprints(tx, "leads", [], current.id))).size).toBe(0);
  });
});
