// Builds the identity module on the test database, and agencies with an Owner, for the identity module's tests; and
// the helpers several of those tests share: members' access, staff, sign-in and platform admins.
import { randomUUID } from "node:crypto";
import type { StaffMember } from "@travel-crm/contracts/identity";
import { createIdentityDatabase, type IdentityDatabase } from "@travel-crm/db/identity";
import type { PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { inject } from "vitest";
import type { AccessSession } from "../../src/identity/access.js";
import type { AuthSettings } from "../../src/identity/auth/create-auth.js";
import { createIdentity, type Identity } from "../../src/identity/identity.js";
import type { MemberAccess } from "../../src/identity/member-access.js";

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

/** A member's access, as a request resolves it. Throws when they aren't an active member of the organization. */
export async function memberAccessOf(
  identity: Identity,
  userId: string,
  organizationId: string,
  session?: AccessSession,
): Promise<MemberAccess> {
  const access = await identity.resolveAccess(userId, organizationId, session);
  if (!access) throw new Error(`User ${userId} is not an active member of organization ${organizationId}`);
  return access;
}

/** Adds a member with this username and role, and a temporary password, as `actor`. */
export function addStaffMember(
  identity: Identity,
  actor: MemberAccess,
  username: string,
  roleKey: string,
): Promise<StaffMember> {
  return identity.staff.create(actor, { name: username, username, roleKey, temporaryPassword: "temporary-pass-1" });
}

/** Signs in with organization code and username through Better Auth; true when it succeeds. */
export async function canSignInByUsername(
  identity: Identity,
  code: string,
  username: string,
  password: string,
): Promise<boolean> {
  const response = await identity.auth.api.signInUsername({
    body: { username: `${code}:${username}`.toLowerCase(), password },
    asResponse: true,
  });
  return response.ok;
}

/** A platform admin (user role "admin", no membership) who can sign in by email with `password`. */
export async function createPlatformAdmin(
  test: TestIdentity,
  password: string,
): Promise<{ userId: string; email: string }> {
  const email = `support-${randomUUID()}@example.test`;
  const user = await test.database.client.user.create({ data: { name: "Support", email, role: "admin" } });
  await test.database.client.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await (await test.identity.auth.$context).password.hash(password),
    },
  });
  return { userId: user.id, email };
}
