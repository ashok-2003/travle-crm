// What the purge and erasure tests share: an onboarded agency with a traveller's stored files, the platform log
// entry an export leaves (the precondition both check), and a storage that fails when told to.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import type { MemoryStorage, ObjectStorage } from "@travel-crm/integrations/storage";
import { memberAccessOf } from "../identity/test-identity.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { onboardOrganization, recordPlatformAudit } from "../../src/platform/index.js";
import { onboardingInput, support, type TestPlatform } from "./test-platform.js";

export const traveller = "0199e7a0-0000-7000-8000-0000000000aa";

export interface DeletionAgency {
  organizationId: string;
  code: string;
  owner: MemberAccess;
}

export async function deletionAgency(test: TestPlatform, plan: PlanSummary): Promise<DeletionAgency> {
  const input = onboardingInput(plan);
  const { organizationId, ownerMemberId } = await onboardOrganization(test.services, support, input);
  const ownerUserId = (await test.identity.database.client.member.findUniqueOrThrow({ where: { id: ownerMemberId } }))
    .userId;
  return {
    organizationId,
    code: input.code,
    owner: await memberAccessOf(test.identity.identity, ownerUserId, organizationId),
  };
}

/** A ready file on the record, stored where the files module keeps it. Returns the attachment's id. */
export async function storedFile(
  test: TestPlatform,
  organizationId: string,
  fileName = "Passport.pdf",
  recordId = traveller,
): Promise<string> {
  const file = await test.services.db.forOrg(organizationId, (tx) =>
    tx.attachment.create({
      data: {
        recordType: "traveller",
        recordId,
        fileName,
        contentType: "application/pdf",
        sizeBytes: 3,
        status: "ready",
        confirmedAt: new Date(),
      },
    }),
  );
  await test.storage.put({
    key: `organizations/${organizationId}/attachments/${file.id}`,
    contentType: "application/pdf",
    body: new Uint8Array([1, 2, 3]),
  });
  return file.id;
}

/** The organization's keys still in storage. */
export function keysOf(test: TestPlatform, organizationId: string): string[] {
  return [...test.storage.objects.keys()].filter((key) => key.startsWith(`organizations/${organizationId}/`));
}

/**
 * What an export leaves in the platform log, which a purge (`organization.exported`) or an erasure
 * (`subject.exported`) looks for. Written straight in: how the export itself is made is the export's tests' business.
 */
export async function exportLogged(
  test: TestPlatform,
  organizationId: string,
  action: "organization.exported" | "subject.exported" = "organization.exported",
  target: { targetType: string; targetId: string } = { targetType: "organization", targetId: organizationId },
): Promise<void> {
  await test.services.platformDb.transaction((tx) =>
    recordPlatformAudit(tx, support, { action, ...target, targetOrganizationId: organizationId }),
  );
}

/** The memory storage, but its deletes fail while `failing` says so: an S3 outage, or the console restarting. */
export function flakyStorage(storage: MemoryStorage): { storage: ObjectStorage; failing: { now: boolean } } {
  const failing = { now: true };
  const refuse = () => Promise.reject(new Error("storage is unreachable"));
  return {
    failing,
    storage: {
      ...storage,
      delete: (key) => (failing.now ? refuse() : storage.delete(key)),
      deletePrefix: (prefix) => (failing.now ? refuse() : storage.deletePrefix(prefix)),
    },
  };
}
