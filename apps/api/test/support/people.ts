// People for the HTTP tests: staff of a test agency, and platform staff, made directly through the identity module.
import type { MemberAccess } from "@travel-crm/domain/identity";
import { CookieJar } from "./cookie-jar.js";
import { signInByEmail, signInWithCode, type TestAgency, type TestServer } from "./test-server.js";

/** The Owner's access, for calling the identity module directly when setting a test up. */
export async function ownerAccess(server: TestServer, agency: TestAgency): Promise<MemberAccess> {
  const access = await server.identity.resolveAccess(agency.owner.userId, agency.organizationId);
  if (!access) throw new Error("the test agency's owner has no access");
  return access;
}

export interface TestStaff {
  userId: string;
  memberId: string;
  username: string;
  password: string;
}

/** Adds staff without email and, unless told otherwise, marks their password as already changed. */
export async function addStaff(
  server: TestServer,
  agency: TestAgency,
  options: { username: string; roleKey: string; mustChangePassword?: boolean },
): Promise<TestStaff> {
  const password = `${options.username}-password-1`;
  const created = await server.identity.staff.create(await ownerAccess(server, agency), {
    name: options.username,
    username: options.username,
    roleKey: options.roleKey,
    temporaryPassword: password,
  });
  if (options.mustChangePassword !== true) {
    await server.platform.user.update({ where: { id: created.userId }, data: { mustChangePassword: false } });
  }
  return { userId: created.userId, memberId: created.memberId, username: options.username, password };
}

/** Signs staff in with the organization code and returns their cookie jar. */
export async function signedInStaff(server: TestServer, agency: TestAgency, staff: TestStaff): Promise<CookieJar> {
  const jar = new CookieJar();
  const response = await signInWithCode(server, jar, {
    orgCode: agency.code,
    username: staff.username,
    password: staff.password,
  });
  if (!response.ok) throw new Error(`staff sign-in failed with ${String(response.status)}`);
  return jar;
}

/** Signs the agency's Owner in by email and returns their cookie jar. */
export async function signedInOwner(server: TestServer, agency: TestAgency): Promise<CookieJar> {
  const jar = new CookieJar();
  const response = await signInByEmail(server, jar, agency.owner.email, agency.owner.password);
  if (!response.ok) throw new Error(`owner sign-in failed with ${String(response.status)}`);
  return jar;
}

/** Platform staff: user role "admin", a password, and no organization (spec 6.1). */
export async function createPlatformAdmin(
  server: TestServer,
): Promise<{ userId: string; email: string; password: string }> {
  const email = `support-${crypto.randomUUID()}@platform.test`;
  const password = "platform-password-1";
  const hash = await (await server.identity.auth.$context).password.hash(password);
  const user = await server.platform.user.create({ data: { name: "Platform support", email, role: "admin" } });
  await server.platform.account.create({
    data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash },
  });
  return { userId: user.id, email, password };
}
