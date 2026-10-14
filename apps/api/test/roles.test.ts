// Roles through the HTTP app (spec 6.5): every member can see them, only roles:manage can change them, the Owner
// role never changes, and a role in use can't be deleted.
import type { PermissionCatalogEntry, RoleSummary } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("roles", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
  });

  afterAll(async () => {
    await server.close();
  });

  it("shows every member the roles and the permission catalog", async () => {
    const sales = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "ravi", roleKey: "sales" }),
    );
    const roles = await dataOf<RoleSummary[]>(await query(server, "roles.list", sales));
    expect(roles.map((role) => role.name)).toEqual(["Owner", "Accounts", "Admin", "Operations", "Sales"]);
    const catalog = await dataOf<PermissionCatalogEntry[]>(await query(server, "roles.permissionCatalog", sales));
    expect(catalog).toContainEqual({ permission: "leads:view", module: "leads", scoped: true });
  });

  it("lets only roles:manage change roles, which Admin doesn't have", async () => {
    const admin = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "admin", roleKey: "org-admin" }),
    );
    expect(await refusalOf(await mutate(server, "roles.create", { name: "Guides", permissions: [] }, admin))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
  });

  it("creates a role, gives it to staff, and edits it, effective on their next request", async () => {
    const guides = await dataOf<RoleSummary>(
      await mutate(
        server,
        "roles.create",
        { name: "मार्गदर्शक", permissions: [{ permission: "departures:view" }] },
        owner,
      ),
    );
    expect(guides.key).toMatch(/^role-[0-9a-f]{6}$/);
    const guide = await addStaff(server, agency, { username: "guide", roleKey: guides.key });
    const jar = await signedInStaff(server, agency, guide);
    expect((await query(server, "staff.list", jar)).status).toBe(403);

    const updated = await mutate(
      server,
      "roles.update",
      { key: guides.key, permissions: [{ permission: "staff:manage" }] },
      owner,
    );
    expect(await dataOf<RoleSummary>(updated)).toMatchObject({
      memberCount: 1,
      permissions: [{ permission: "staff:manage", scope: null }],
    });
    expect((await query(server, "staff.list", jar)).status).toBe(200);
  });

  it("explains invalid permissions", async () => {
    const unknown = await mutate(
      server,
      "roles.create",
      { name: "Visas", permissions: [{ permission: "visas:apply" }] },
      owner,
    );
    expect(await refusalOf(unknown)).toEqual({ status: 400, reason: "UNKNOWN_PERMISSION" });
    const noScope = await mutate(
      server,
      "roles.create",
      { name: "Viewers", permissions: [{ permission: "leads:view" }] },
      owner,
    );
    expect(await refusalOf(noScope)).toEqual({ status: 400, reason: "SCOPE_REQUIRED" });
  });

  it("never changes the Owner role", async () => {
    expect(await refusalOf(await mutate(server, "roles.update", { key: "org-owner", permissions: [] }, owner))).toEqual(
      {
        status: 403,
        reason: "OWNER_ROLE_IS_FIXED",
      },
    );
  });

  it("refuses to delete a role staff have, and deletes one they don't", async () => {
    expect(await refusalOf(await mutate(server, "roles.delete", { key: "sales" }, owner))).toEqual({
      status: 409,
      reason: "ROLE_IN_USE",
    });
    expect((await mutate(server, "roles.delete", { key: "accounts" }, owner)).status).toBe(200);
    const names = (await dataOf<RoleSummary[]>(await query(server, "roles.list", owner))).map((role) => role.name);
    expect(names).not.toContain("Accounts");
  });
});
