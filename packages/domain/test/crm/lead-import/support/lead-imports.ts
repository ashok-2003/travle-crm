// A lead import for the check's and the add's tests: its file in storage, its columns matched to fields, and the
// listener events that drive them.
import type { ImportField } from "@travel-crm/contracts/imports";
import type { Entitlements } from "../../../../src/subscriptions/index.js";
import type { ImportIdentity, ImportJobDependencies } from "../../../../src/imports/index.js";
import type { BatchSeed } from "../../../imports/support/batches.js";
import { anImportWithFile, jobDependencies, type TestImports } from "../../../imports/support/test-imports.js";
import type { MemberAccess } from "../../../../src/identity/index.js";
import type { DomainEvent } from "../../../../src/jobs/index.js";

export interface LeadFileSeed {
  header: string[];
  rows: (string | null)[][];
  /** The field each column holds, by position; null (or missing) for "Don't import". */
  fields: (ImportField | null)[];
  seed?: Partial<BatchSeed>;
}

/** An import of leads at `status` (checking unless told) with its file stored and its columns matched. */
export async function aLeadImport(
  test: TestImports,
  importer: MemberAccess,
  file: LeadFileSeed,
): Promise<{ id: string }> {
  const bytes = test.spreadsheets.bytesOf({ header: file.header, rows: file.rows });
  const created = await anImportWithFile(test, importer, bytes, { status: "checking", ...file.seed });
  await test.db.forOrg(importer.organizationId, (tx) =>
    tx.importColumn.createMany({
      data: file.header.map((header, position) => ({
        batchId: created.id,
        position,
        header,
        field: file.fields[position] ?? null,
      })),
    }),
  );
  return { id: created.id };
}

/** The event a step's listener is built on. */
export function stepEvent(organizationId: string, type: string, importId: string): DomainEvent {
  return {
    id: crypto.randomUUID(),
    organizationId,
    type,
    payload: { importId, kind: "leads" },
    occurredAt: new Date(),
  };
}

/** What a plan with the CRM allows: full access, or read-only for an agency that may no longer change things. */
export function crmEntitlements(access: Entitlements["access"] = "full"): Entitlements {
  return {
    status: access === "full" ? "active" : "read_only",
    access,
    planName: "Growth",
    modules: new Set(["crm"]),
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1_000_000 },
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
  };
}

/** The listeners' dependencies for an agency whose subscription allows the CRM's changes (unless told otherwise). */
export function leadJobDependencies(
  test: TestImports,
  identity: ImportIdentity,
  access: Entitlements["access"] = "full",
): ImportJobDependencies {
  return {
    ...jobDependencies(test, identity),
    subscriptions: { entitlementsOf: () => Promise.resolve(crmEntitlements(access)) },
  };
}
