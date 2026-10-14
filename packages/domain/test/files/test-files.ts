// Builds the files module on the test database with in-memory storage, and members holding starter roles.
import { randomUUID } from "node:crypto";
import type { RequestUploadInput } from "@travel-crm/contracts/files";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { inject } from "vitest";
import { createFiles, type Files } from "../../src/files/index.js";
import { PermissionSet, starterRoles, type MemberAccess } from "../../src/identity/index.js";

export interface TestFiles {
  files: Files;
  storage: MemoryStorage;
  db: Database;
  platform: PlatformClient;
  close(): Promise<void>;
}

export function createTestFiles(options: { storageLimitBytes?: number } = {}): TestFiles {
  const urls = inject("dbUrls");
  const db = createDatabase(urls.runtime, { maxConnections: 2 });
  const platform = createPlatformClient(urls.platform);
  const storage = createMemoryStorage();
  const limit = options.storageLimitBytes;
  const files = createFiles({
    db,
    storage,
    storageLimitBytes: limit === undefined ? undefined : () => Promise.resolve(limit),
  });
  return {
    files,
    storage,
    db,
    platform,
    close: async () => {
      await db.disconnect();
      await platform.$disconnect();
    },
  };
}

export function createOrganization(test: TestFiles, name = "Files agency"): Promise<string> {
  return createTestOrganization(test.platform, name);
}

/** A member of the organization holding one of the starter roles, e.g. memberOf(id, "operations"). */
export function memberOf(organizationId: string, roleKey: string): MemberAccess {
  const role = starterRoles.find((starter) => starter.key === roleKey);
  if (!role) throw new Error(`No starter role ${roleKey}`);
  return {
    userId: randomUUID(),
    memberId: randomUUID(),
    organizationId,
    source: "web",
    impersonatedBy: null,
    role: { key: role.key, name: role.name, isOwner: role.isOwner },
    permissions: role.isOwner ? PermissionSet.everything() : PermissionSet.of(role.grants),
    mustChangePassword: false,
    twoFactorEnabled: false,
    organizationRequiresTwoFactor: false,
  };
}

/** A passport scan for a lead, as the web app would ask to upload it. */
export function passportUpload(overrides: Partial<RequestUploadInput> = {}): RequestUploadInput {
  return {
    recordType: "lead",
    recordId: "0199e7a0-0000-7000-8000-0000000000f2",
    fileName: "Passport - Asha.pdf",
    contentType: "application/pdf",
    sizeBytes: 11,
    sensitive: false,
    ...overrides,
  };
}

export const bytes = (text: string) => new TextEncoder().encode(text);
