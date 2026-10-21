// What the staff import's tests share: an agency on the real identity with an Admin who may import, a staff file's
// import carried through the check, and the listeners' events and dependencies.
import type { ImportField } from "@travel-crm/contracts/imports";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { inject } from "vitest";
import { createIdentity, type Identity, type IdentityOptions, type MemberAccess } from "../../../src/identity/index.js";
import { checkStaffImportListener, type ImportJobDependencies } from "../../../src/imports/index.js";
import type { DomainEvent } from "../../../src/jobs/index.js";
import type { Entitlements } from "../../../src/subscriptions/index.js";
import { createTestAgency, memberAccessOf, testAuthSettings, type TestAgency } from "../../identity/test-identity.js";
import {
  anImportWithFile,
  createTestImports,
  jobDependencies,
  listenerContext,
  type TestImports,
} from "../support/test-imports.js";

export type Cell = string | null;

/** An agency on a paid plan: the job may change things. */
export const paid: Entitlements = {
  status: "active",
  access: "full",
  planName: "Growth",
  modules: new Set(["crm"]),
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1_000_000 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
};

export interface StaffWorld {
  test: TestImports;
  platform: PlatformClient;
  identity: Identity;
  agency: TestAgency;
  owner: MemberAccess;
  /** An Admin: may manage staff and give any role but the Owner's and those above their own. */
  admin: MemberAccess;
  /** The key of a role that allows more than the Admin holds. */
  above: string;
  close(): Promise<void>;
}

/** The identity module on the test database, with the plan's seats if given. */
export function identityOn(seats: number | null = null, options: Partial<IdentityOptions> = {}): Identity {
  return createIdentity({
    databaseUrl: inject("dbUrls").runtime,
    maxConnections: 3,
    auth: testAuthSettings,
    seatLimit: () => Promise.resolve(seats),
    ...options,
  });
}

export async function createStaffWorld(seats: number | null = null): Promise<StaffWorld> {
  const test = createTestImports();
  const platform = createPlatformClient(inject("dbUrls").platform);
  // The agency is set up without the seats' limit, which the tests that need one put on their own identity.
  const setup = identityOn();
  const agency = await createTestAgency(setup, platform);
  const owner = await memberAccessOf(setup, agency.ownerUserId, agency.organizationId);
  const made = await setup.staff.create(owner, {
    name: "Admin",
    username: "the-admin",
    roleKey: "org-admin",
    temporaryPassword: "temporary-pass-5",
  });
  const above = (await setup.roles.create(owner, { name: "Directors", permissions: [{ permission: "roles:manage" }] }))
    .key;
  const identity = identityOn(seats);
  const admin = await memberAccessOf(identity, made.userId, agency.organizationId);
  await setup.disconnect();
  return {
    test,
    platform,
    identity,
    agency,
    owner,
    admin,
    above,
    close: async () => {
      await identity.disconnect();
      await platform.$disconnect();
      await test.close();
    },
  };
}

export const dependenciesOn = (
  world: Pick<StaffWorld, "test">,
  identity: Identity,
  entitlements: Entitlements | null = paid,
): ImportJobDependencies => ({
  ...jobDependencies(world.test, identity),
  subscriptions: { entitlementsOf: () => Promise.resolve(entitlements) },
});

export const stepEvent = (
  world: Pick<StaffWorld, "agency">,
  type: "import.columns-matched" | "import.add-requested",
  importId: string,
  kind: "staff" | "leads" = "staff",
): DomainEvent => ({
  id: crypto.randomUUID(),
  organizationId: world.agency.organizationId,
  type,
  payload: { importId, kind },
  occurredAt: new Date(),
});

export const standardFile = {
  header: ["Name", "Username", "Email", "Phone", "Role"],
  fields: ["name", "username", "email", "phone", "role"] as ImportField[],
  roles: { Sales: "sales", Operations: "operations", Owner: "org-owner" } as Record<string, string | null>,
};

export interface StaffFile {
  header: string[];
  fields: (ImportField | null)[];
  rows: Cell[][];
  defaultRoleKey?: string;
  roles?: Record<string, string | null>;
  importer?: MemberAccess;
}

/** A staff import for the file, its columns and role values matched, carried through the check. */
export async function checkedStaffImport(world: StaffWorld, file: StaffFile) {
  const { test, agency } = world;
  const importer = file.importer ?? world.admin;
  const bytes = test.spreadsheets.bytesOf({ header: file.header, rows: file.rows });
  const { id } = await anImportWithFile(test, importer, bytes, {
    kind: "staff",
    status: "checking",
    checkedAt: null,
    defaultRoleKey: file.defaultRoleKey ?? null,
  });
  await test.db.forOrg(agency.organizationId, async (tx) => {
    await tx.importColumn.createMany({
      data: file.header.map((header, position) => ({
        batchId: id,
        position,
        header,
        field: file.fields[position] ?? null,
      })),
    });
    await tx.importValueMatch.createMany({
      data: Object.entries(file.roles ?? {}).map(([value, target]) => ({
        batchId: id,
        field: "role",
        value,
        target,
        matchedBy: "name",
      })),
    });
  });
  await checkStaffImportListener(dependenciesOn(world, world.identity)).handle(
    stepEvent(world, "import.columns-matched", id),
    listenerContext(test, agency.organizationId),
  );
  return { id, ...(await readImport(world, id)) };
}

/** The import and its rows as they are now. */
export async function readImport(world: Pick<StaffWorld, "test" | "agency">, id: string) {
  const { test, agency } = world;
  const rows = await test.db.forOrg(agency.organizationId, (tx) =>
    tx.importRow.findMany({ where: { batchId: id }, orderBy: { rowNumber: "asc" } }),
  );
  const batch = await test.db.forOrg(agency.organizationId, (tx) =>
    tx.importBatch.findUniqueOrThrow({ where: { id } }),
  );
  return { batch, rows, byRow: (n: number) => rows.find((row) => row.rowNumber === n) };
}
