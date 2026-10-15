// An erasure expires every stored export of its organization, in its own transaction once its deletes are done: an
// export is kept for 7 days, and the erased person must not stay in one. The function is wave P's; until the fix
// wave merges, a stand-in of the same signature (merge-stand-ins.ts) is watched here.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { expireOrganizationExports } from "../../src/platform/merge-stand-ins.js";
import { eraseSubject, requestErasure } from "../../src/platform/index.js";
import { erasureJobOf } from "../../src/platform/erasure.js";
import { deletionAgency, exportTraveller, storedFile, traveller } from "./test-deletion.js";
import { createTestPlan, createTestPlatform, support, type TestPlatform } from "./test-platform.js";

vi.mock("../../src/platform/merge-stand-ins.js", { spy: true });

describe("an erasure's stored exports", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  it("expires every export of the organization, in the erasure's transaction, after its deletes", async () => {
    const { organizationId, code } = await deletionAgency(test, plan);
    await storedFile(test, organizationId, "Passport.pdf");
    await exportTraveller(test.services, organizationId);
    const subject = { kind: "record" as const, recordType: "traveller", recordId: traveller };
    await requestErasure(test.services, support, { organizationId, subject, confirmation: code });
    const sent = test.queue.sent.at(-1);
    if (!sent) throw new Error("no erasure job was queued");
    const seen: number[] = [];
    vi.mocked(expireOrganizationExports).mockImplementationOnce(async (_services, tx) => {
      // The same transaction: the record's files are already gone from it.
      seen.push(await tx.attachment.count({ where: { organizationId } }));
    });

    await eraseSubject(test.services, erasureJobOf(sent.data));

    expect(expireOrganizationExports).toHaveBeenCalledExactlyOnceWith(
      test.services,
      expect.anything(),
      organizationId,
      "erasure",
    );
    expect(seen).toEqual([0]);
  });
});
