// A large staff stays fast (spec 11, ADR 0028): an agency with 500 staff reads the staff export's rows within 150 ms,
// looks up a 500-row file's usernames and emails in one query within 500 ms, and adds 500 more people in one
// transaction, each with an account, a membership and an audit entry, within 10 s. Everything runs as app_runtime
// inside the identity module, under row-level security.
import { randomUUID } from "node:crypto";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createIsolatedDatabase, createTestOrganization, type IsolatedDatabase } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createIdentity, type Identity, type ImportedStaffRow, type MemberAccess } from "../../src/identity/index.js";
import { testAuthSettings } from "../identity/test-identity.js";
import { budgetMs, fastestMs } from "./query-plans.js";

const STAFF = 500;

describe("a large staff", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let identity: Identity;
  let organizationId: string;
  let owner: MemberAccess;

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    identity = createIdentity({ databaseUrl: isolated.urls.runtime, maxConnections: 3, auth: testAuthSettings });
    organizationId = await createTestOrganization(platform, "Large staff");
    const code = (await platform.organization.findUniqueOrThrow({ where: { id: organizationId } })).code.toLowerCase();
    await identity.seedStarterRoles(organizationId);
    const created = await identity.createOrganizationOwner(organizationId, {
      name: "Asha Owner",
      email: "asha@large-staff.example.test",
      password: "owner-password-1",
      mustChangePassword: false,
    });
    const access = await identity.resolveAccess(created.userId, organizationId);
    if (access === null) throw new Error("the owner has no access");
    owner = access;
    // 500 people already on the staff, written set-based: the way an agency that has grown looks.
    const people = Array.from({ length: STAFF }, (_, index) => ({ id: randomUUID(), number: index + 1 }));
    await platform.user.createMany({
      data: people.map(({ id, number }) => ({
        id,
        name: `Staff ${String(number)}`,
        email: `staff-${String(number)}@large-staff.example.test`,
        username: `${code}:staff${String(number)}`,
        displayUsername: `staff${String(number)}`,
      })),
    });
    await platform.member.createMany({
      data: people.map(({ id }) => ({ userId: id, organizationId, role: "sales", phoneE164: "+919876543210" })),
    });
  }, 120_000);

  afterAll(async () => {
    await identity.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  it("reads the staff export's rows within 150 ms", async () => {
    expect((await identity.staff.exportRows(owner)).length).toBe(STAFF + 1);
    const ms = await fastestMs(() => identity.staff.exportRows(owner));
    console.info("Staff export rows:", Math.round(ms * 10) / 10, "ms");
    expect(ms).toBeLessThan(150);
  });

  it("looks up a 500-row file's usernames and emails within 500 ms", async () => {
    const names = {
      usernames: Array.from({ length: STAFF }, (_, index) => `staff${String(index * 2 + 1)}`),
      emails: Array.from({ length: STAFF }, (_, index) => `staff-${String(index * 2 + 1)}@large-staff.example.test`),
    };
    const facts = await identity.staff.rowFacts(owner, names);
    // Half of each list names someone on the staff.
    expect(facts.activeUsernames.size).toBe(STAFF / 2);
    expect(facts.activeEmails.size).toBe(STAFF / 2);
    const ms = await fastestMs(() => identity.staff.rowFacts(owner, names));
    console.info("Staff row facts:", Math.round(ms * 10) / 10, "ms");
    expect(ms).toBeLessThan(500);
  });

  it("adds 500 people in one transaction within 10 s", async () => {
    const [passwordHash = ""] = await identity.staff.hashTemporaryPasswords(["Temp-pass-12345"]);
    const rows: ImportedStaffRow[] = Array.from({ length: STAFF }, (_, index) => ({
      rowNumber: index + 2,
      name: `Imported ${String(index + 1)}`,
      username: `imported${String(index + 1)}`,
      email: `imported-${String(index + 1)}@large-staff.example.test`,
      phone: "+919811122233",
      roleKey: "sales",
      passwordHash,
    }));
    const started = performance.now();
    const added = await identity.staff.addImported(owner, rows, randomUUID(), () => Promise.resolve());
    const ms = performance.now() - started;
    console.info("Staff import add (500):", Math.round(ms), "ms");
    expect(added).toHaveLength(STAFF);
    expect(ms).toBeLessThan(budgetMs(10_000));
    expect((await identity.staff.list(owner)).length).toBe(2 * STAFF + 1);
  }, 60_000);
});
