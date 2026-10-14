// @travel-crm/db/identity: organization transactions that also reach the sign-in tables, and a client for Better Auth
// that sets no organization. OrgTx, which every other module gets, hides the sign-in tables and raw-string SQL.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { OrgTx } from "../src/for-org.js";
import { createIdentityDatabase, type IdentityDatabase } from "../src/identity.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("identity database", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let identityDatabase: IdentityDatabase;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    identityDatabase = createIdentityDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Identity database");
  });

  afterAll(async () => {
    await identityDatabase.disconnect();
    await platform.$disconnect();
  });

  it("reaches the sign-in tables and the organization's own rows in one transaction", async () => {
    const result = await identityDatabase.forOrg(organizationId, async (tx) => {
      const role = await tx.role.create({ data: { key: "guide", name: "Guide" } });
      const user = await tx.user.create({ data: { name: "Meera", email: `meera-${organizationId}@example.test` } });
      const member = await tx.member.create({ data: { userId: user.id, organizationId, role: role.key } });
      return { roleOrganization: role.organizationId, memberRole: member.role };
    });
    expect(result).toEqual({ roleOrganization: organizationId, memberRole: "guide" });
  });

  it("sees no organization-owned rows through the client, which sets no organization", async () => {
    expect(await identityDatabase.client.role.count()).toBe(0);
    expect(await identityDatabase.client.member.count({ where: { organizationId } })).toBe(1);
  });

  it("hides the sign-in tables and raw-string SQL from OrgTx", () => {
    // Compile-time checks: `pnpm typecheck` fails if OrgTx exposes any of these again.
    const hidden = (tx: OrgTx): unknown[] => [
      // @ts-expect-error member has no row-level security; only the identity module may query it
      tx.member,
      // @ts-expect-error user is a sign-in table
      tx.user,
      // @ts-expect-error organization is a sign-in table
      tx.organization,
      // @ts-expect-error raw-string SQL could switch the organization
      tx.$executeRawUnsafe,
      // @ts-expect-error raw-string SQL could switch the organization
      tx.$queryRawUnsafe,
    ];
    expect(typeof hidden).toBe("function");
  });
});
