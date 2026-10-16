// Platform staff for the console's journeys, made in the database as the api's tests make them (a platform role, a
// password account, no membership), with two-factor turned on through Better Auth's own endpoints, as staff do on the
// setup screen, while features.twoFactor is on; and a newcomer with a temporary password and no two-factor yet.
// signInToConsole signs them in through /api/auth as the sign-in screen does: the password, then the authenticator's
// code when two-factor is on.
import { request as playwrightRequest, type Page } from "@playwright/test";
import { features } from "@travel-crm/contracts/features";
import type { PlatformClient } from "@travel-crm/db/platform";
import type { Identity } from "@travel-crm/domain/identity";
import { expect, test as base } from "./fixtures";
import { secretOf, totpCode } from "./totp";

export interface PlatformStaff {
  userId: string;
  name: string;
  email: string;
  password: string;
  level: "support" | "super-admin";
  /** The authenticator secret while two-factor is on (the console then requires it); null while it is off. */
  totpSecret: string | null;
}

/** Better Auth's user.role for each level (packages/domain/src/identity/access.ts). */
const roleOf = { support: "admin", "super-admin": "super-admin" } as const;

function originHeader(): { origin: string } {
  return { origin: process.env.E2E_BASE_URL ?? "" };
}

/** Platform staff as a super admin adds them: who they are, and the temporary password they must replace. */
export type NewPlatformStaff = Omit<PlatformStaff, "totpSecret">;

interface Database {
  identity: Identity;
  platform: PlatformClient;
}

async function createUser(
  database: Database,
  level: PlatformStaff["level"],
  name: string,
  { mustChangePassword }: { mustChangePassword: boolean },
): Promise<NewPlatformStaff> {
  const email = `${level}-${crypto.randomUUID()}@platform.test`;
  const password = "platform-password-1";
  const hash = await (await database.identity.auth.$context).password.hash(password);
  const user = await database.platform.user.create({
    data: { name, email, role: roleOf[level], mustChangePassword },
  });
  await database.platform.account.create({
    data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash },
  });
  return { userId: user.id, name, email, password, level };
}

async function createPlatformStaff(
  database: Database,
  baseURL: string,
  level: PlatformStaff["level"],
  name: string,
): Promise<PlatformStaff> {
  const { userId, email, password } = await createUser(database, level, name, { mustChangePassword: false });
  if (!features.twoFactor) return { userId, name, email, password, level, totpSecret: null };
  // Turned on in a browser context of its own, so the journey's page starts signed out.
  const api = await playwrightRequest.newContext({ baseURL });
  try {
    const headers = originHeader();
    expect((await api.post("/api/auth/sign-in/email", { data: { email, password }, headers })).ok()).toBe(true);
    const enabled = await api.post("/api/auth/two-factor/enable", { data: { password }, headers });
    expect(enabled.ok()).toBe(true);
    const totpSecret = secretOf(((await enabled.json()) as { totpURI: string }).totpURI);
    const verified = await api.post("/api/auth/two-factor/verify-totp", {
      data: { code: totpCode(totpSecret) },
      headers,
    });
    expect(verified.ok()).toBe(true);
    return { userId, name, email, password, level, totpSecret };
  } finally {
    await api.dispose();
  }
}

export const test = base.extend<{ superAdmin: PlatformStaff; support: PlatformStaff; newcomer: NewPlatformStaff }>({
  superAdmin: async ({ database, baseURL }, use) => {
    await use(await createPlatformStaff(database, baseURL ?? "", "super-admin", "Kavita Rao"));
  },
  support: async ({ database, baseURL }, use) => {
    await use(await createPlatformStaff(database, baseURL ?? "", "support", "Arjun Nair"));
  },
  newcomer: async ({ database }, use) => {
    await use(await createUser(database, "support", "Neha Joshi", { mustChangePassword: true }));
  },
});

export { expect };

/**
 * Signs platform staff in through the api, as the sign-in screen does: the password, which asks for a code while
 * two-factor is on, then the authenticator's code. Better Auth 1.7.7 takes a code again within its 30 seconds, as the
 * setup's was.
 */
export async function signInToConsole(page: Page, staff: PlatformStaff): Promise<void> {
  const headers = originHeader();
  const signedIn = await page.request.post("/api/auth/sign-in/email", {
    data: { email: staff.email, password: staff.password },
    headers,
  });
  expect(signedIn.ok()).toBe(true);
  if (staff.totpSecret === null) {
    expect(await signedIn.json()).not.toHaveProperty("twoFactorRedirect");
    return;
  }
  expect(await signedIn.json()).toMatchObject({ twoFactorRedirect: true });
  const verified = await page.request.post("/api/auth/two-factor/verify-totp", {
    data: { code: totpCode(staff.totpSecret) },
    headers,
  });
  expect(verified.ok()).toBe(true);
}
