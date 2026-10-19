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
import type { ImportIdentity, ImportJobDependencies } from "../../../src/imports/index.js";
import type { ListenerContext } from "../../../src/jobs/index.js";
import { systemActor } from "../../../src/kernel/index.js";
import { memberWithStarterRole } from "../../identity/rule-helpers.js";
import { aBatch, type BatchSeed } from "./batches.js";

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

/**
 * An identity for the listeners' tests: lead workers and roles found by their exact names in lower case, and the
 * importer's access as given. Anything else it is asked throws.
 */
export function fakeIdentity(
  options: {
    workers?: Record<string, string>;
    roles?: Record<string, string>;
    access?: MemberAccess | null;
    firstOwner?: string | null;
  } = {},
): ImportIdentity {
  const lookUp = <Match>(names: Record<string, string>, values: readonly string[], match: (id: string) => Match) =>
    Promise.resolve(
      new Map(
        values.flatMap((value) => {
          const id = names[value.trim().toLowerCase()];
          return id === undefined ? [] : [[value, match(id)] as const];
        }),
      ),
    );
  const unexpected = () => Promise.reject(new Error("Not part of this test"));
  return {
    resolveAccess: () => Promise.resolve(options.access ?? null),
    firstOwner: () => Promise.resolve(options.firstOwner ?? null),
    leadWorkers: () =>
      Promise.resolve(Object.entries(options.workers ?? {}).map(([name, userId]) => ({ userId, name }))),
    matchLeadWorkers: (_organizationId, values) =>
      lookUp(options.workers ?? {}, values, (userId) => ({ userId, matchedBy: "name" as const })),
    matchRoles: (_organizationId, values) =>
      lookUp(options.roles ?? {}, values, (roleKey) => ({ roleKey, matchedBy: "name" as const })),
    staff: {
      list: unexpected,
      create: unexpected,
      updateRole: unexpected,
      resetPassword: unexpected,
      remove: unexpected,
    },
  };
}

/** The listeners' dependencies: the test's files and spreadsheets, an identity, an agency that may change, no seats. */
export function jobDependencies(test: TestImports, identity: ImportIdentity = fakeIdentity()): ImportJobDependencies {
  return {
    files: test.files,
    spreadsheets: test.spreadsheets,
    identity,
    subscriptions: { entitlementsOf: () => Promise.resolve(null) },
    seatLimit: () => Promise.resolve(null),
  };
}

/** An import waiting at `status` (reading unless told) whose file, these JSON-sheet bytes, is in storage. */
export async function anImportWithFile(
  test: TestImports,
  importer: MemberAccess,
  file: Uint8Array,
  seed: Partial<BatchSeed> = {},
): Promise<{ id: string; attachmentId: string }> {
  const { id } = await test.db.forOrg(importer.organizationId, (tx) =>
    aBatch(tx, { status: "reading", checkedAt: null, ...seed, startedBy: importer.userId }),
  );
  const stored = await test.files.storeGeneratedFile(importer, {
    recordType: "import_batch",
    recordId: id,
    fileName: "enquiries-oct-2026.csv",
    contentType: "text/csv",
    body: file,
  });
  await test.db.forOrg(importer.organizationId, (tx) =>
    tx.importBatch.update({ where: { id }, data: { fileAttachmentId: stored.id } }),
  );
  return { id, attachmentId: stored.id };
}

/** The context, counting the transactions it opens. */
export function countingContext(test: TestImports, organizationId: string) {
  const counted = { transactions: 0 };
  const context: ListenerContext = {
    actor: systemActor(organizationId),
    forOrg: (fn) => {
      counted.transactions += 1;
      return test.db.forOrg(organizationId, fn);
    },
  };
  return { context, counted };
}
