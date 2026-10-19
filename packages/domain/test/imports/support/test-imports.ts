// Builds what the imports module's tests need on the test database: the files module on in-memory storage, the
// in-memory spreadsheets, agencies, importers holding the Admin starter role, and readers of the events and audit
// entries an import leaves.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createMemorySpreadsheets, type MemorySpreadsheets } from "@travel-crm/integrations/spreadsheets";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { inject } from "vitest";
import { createFiles, type Files } from "../../../src/files/index.js";
import type { MemberAccess } from "../../../src/identity/index.js";
import type { ListenerContext } from "../../../src/jobs/index.js";
import { systemActor } from "../../../src/kernel/index.js";
import { memberWithStarterRole } from "../../identity/rule-helpers.js";

export interface TestImports {
  db: Database;
  platform: PlatformClient;
  storage: MemoryStorage;
  files: Files;
  spreadsheets: MemorySpreadsheets;
  close(): Promise<void>;
}

export function createTestImports(options: { storageLimitBytes?: number } = {}): TestImports {
  const urls = inject("dbUrls");
  const db = createDatabase(urls.runtime, { maxConnections: 3 });
  const platform = createPlatformClient(urls.platform);
  const storage = createMemoryStorage();
  const limit = options.storageLimitBytes;
  const files = createFiles({
    db,
    storage,
    storageLimitBytes: limit === undefined ? undefined : () => Promise.resolve(limit),
  });
  return {
    db,
    platform,
    storage,
    files,
    spreadsheets: createMemorySpreadsheets(),
    close: async () => {
      await db.disconnect();
      await platform.$disconnect();
    },
  };
}

export const anAgency = (test: TestImports, name = "Imports agency") => createTestOrganization(test.platform, name);

/** A member holding a starter role (the Admin's unless told), with ids a uuid column takes. */
export function memberOf(organizationId: string, roleKey = "org-admin", overrides: Partial<MemberAccess> = {}) {
  return memberWithStarterRole(roleKey, { organizationId, userId: randomUUID(), memberId: randomUUID(), ...overrides });
}

/** The worker's context in the organization, as the jobs module builds it. */
export function listenerContext(test: TestImports, organizationId: string): ListenerContext {
  return { actor: systemActor(organizationId), forOrg: (fn) => test.db.forOrg(organizationId, fn) };
}

/** The events of these types the organization's outbox holds, oldest first, as [type, payload]. */
export function eventsOf(test: TestImports, organizationId: string, types: readonly string[]) {
  return test.db.forOrg(organizationId, async (tx) =>
    (await tx.outboxEvent.findMany({ where: { type: { in: [...types] } }, orderBy: { id: "asc" } })).map(
      (event) => [event.type, event.payload] as const,
    ),
  );
}

/** The audit entries about one record, oldest first. */
export function auditOf(test: TestImports, organizationId: string, entityId: string) {
  return test.db.forOrg(organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { entityId }, orderBy: { id: "asc" } }),
  );
}

export const bytes = (text: string) => new TextEncoder().encode(text);
