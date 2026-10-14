// Builds the identity module on the test database, and agencies with an Owner, for the identity module's tests.
import { createIdentityDatabase, type IdentityDatabase } from "@travel-crm/db/identity";
import type { PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { inject } from "vitest";
import type { AuthSettings } from "../../src/identity/auth/create-auth.js";
import { createIdentity, type Identity } from "../../src/identity/identity.js";

export const testAuthSettings: AuthSettings = {
  appName: "Test CRM",
  secret: "test-secret-".padEnd(48, "x"),
  baseUrl: "http://localhost",
  trustedOrigins: [],
  secureCookies: false,
  rateLimit: false,
  ipAddressHeaders: ["x-forwarded-for"],
  trustedProxies: [],
};

/** The identity module, plus direct database access for setting up and checking rows. */
export interface TestIdentity {
  identity: Identity;
  database: IdentityDatabase;
  close(): Promise<void>;
}

export function createTestIdentity(): TestIdentity {
  const { runtime } = inject("dbUrls");
  const identity = createIdentity({ databaseUrl: runtime, maxConnections: 3, auth: testAuthSettings });
  const database = createIdentityDatabase(runtime, { maxConnections: 2 });
  return {
    identity,
    database,
    close: async () => {
      await identity.disconnect();
      await database.disconnect();
    },
  };
}

export interface TestAgency {
  organizationId: string;
  code: string;
  ownerUserId: string;
  ownerMemberId: string;
  ownerEmail: string;
  ownerPassword: string;
}

/** An organization with its starter roles and an Owner who can sign in by email. */
export async function createTestAgency(identity: Identity, platform: PlatformClient): Promise<TestAgency> {
  const organizationId = await createTestOrganization(platform, "Test agency");
  const { code } = await platform.organization.findUniqueOrThrow({ where: { id: organizationId } });
  await identity.seedStarterRoles(organizationId);
  const ownerEmail = `owner-${code.toLowerCase()}@example.test`;
  const ownerPassword = "owner-password-1";
  const owner = await identity.createOrganizationOwner(organizationId, {
    name: "Asha Owner",
    email: ownerEmail,
    password: ownerPassword,
    mustChangePassword: false,
  });
  return { organizationId, code, ownerUserId: owner.userId, ownerMemberId: owner.memberId, ownerEmail, ownerPassword };
}

/** Signs in by email through Better Auth and returns headers carrying the session cookies. */
export async function signInByEmail(identity: Identity, email: string, password: string): Promise<Headers> {
  const response = await identity.auth.api.signInEmail({ body: { email, password }, asResponse: true });
  if (!response.ok) throw new Error(`Sign-in failed with ${String(response.status)}`);
  const cookie = response.headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}
