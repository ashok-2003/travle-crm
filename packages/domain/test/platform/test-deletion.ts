// What the purge and erasure tests share: an onboarded agency with a traveller's stored files, the exports both
// need first, and a storage that fails when told to.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import type { MemoryStorage, ObjectStorage } from "@travel-crm/integrations/storage";
import { memberAccessOf } from "../identity/test-identity.js";
import type { MemberAccess } from "../../src/identity/index.js";
import {
  exportOrganization,
  exportSubject,
  onboardOrganization,
  type PlatformServices,
} from "../../src/platform/index.js";
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
 * Exports the organization, as a purge needs, through this branch's export (it logs `organization.exported`). Wave
 * P's export is a job, and its helper of this name and signature (test-exports.ts) takes this one's place at merge.
 */
export async function exportOrganizationNow(services: PlatformServices, organizationId: string): Promise<void> {
  await exportOrganization(services, support, organizationId);
}

/** Exports what the organization keeps about one traveller, as an erasure needs (it logs `subject.exported`). */
export async function exportTraveller(services: PlatformServices, organizationId: string): Promise<void> {
  await exportSubject(services, support, {
    organizationId,
    subject: { kind: "record", recordType: "traveller", recordId: traveller },
  });
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
