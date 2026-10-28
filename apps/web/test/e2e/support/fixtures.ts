// What every journey starts from: the web app's address, and a new organization of its own, on an active
// subscription, with an Owner who signs in by email, made directly in the database the way onboarding (plan 4) does.
// Staff are added the same way. Every journey also ends with an accessibility check of its last screen
// (accessible-after-each.ts).
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createIdentity, type Identity, type MemberAccess } from "@travel-crm/domain/identity";
import { test as base } from "./accessible-after-each";
import { subscribeToEverything } from "./subscriptions";

export { skipAccessibilityCheck } from "./accessible-after-each";

function environment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run the journeys with \`pnpm --filter @travel-crm/web e2e\``);
  return value;
}

export interface Agency {
  organizationId: string;
  code: string;
  name: string;
  owner: { name: string; email: string; password: string };
}

export interface Staff {
  name: string;
  username: string;
  password: string;
}

interface Database {
  identity: Identity;
  platform: PlatformClient;
}

interface Fixtures {
  agency: Agency;
  /** Adds staff without email to the agency. With mustChangePassword they must replace the password at sign-in. */
  addStaff: (options: {
    name: string;
    username: string;
    roleKey: string;
    mustChangePassword?: boolean;
  }) => Promise<Staff>;
}

export const test = base.extend<Fixtures, { database: Database }>({
  baseURL: async ({}, use) => {
    await use(environment("E2E_BASE_URL"));
  },
  database: [
    async ({}, use) => {
      const identity = createIdentity({
        databaseUrl: environment("E2E_DATABASE_URL"),
        maxConnections: 2,
        auth: {
          appName: "E2E",
          secret: "e2e-only-secret-".padEnd(48, "x"),
          baseUrl: environment("E2E_BASE_URL"),
          trustedOrigins: [],
          secureCookies: false,
          rateLimit: false,
          ipAddressHeaders: ["x-forwarded-for"],
          trustedProxies: [],
        },
      });
      const platform = createPlatformClient(environment("E2E_PLATFORM_DATABASE_URL"));
      await use({ identity, platform });
      await identity.disconnect();
      await platform.$disconnect();
    },
    { scope: "worker" },
  ],
  agency: async ({ database }, use) => {
    const organizationId = await createTestOrganization(database.platform, "Sharma Travels");
    await subscribeToEverything(database.platform, organizationId);
    const { code } = await database.platform.organization.findUniqueOrThrow({ where: { id: organizationId } });
    await database.identity.seedStarterRoles(organizationId);
    const owner = {
      name: "Asha Sharma",
      email: `owner-${code.toLowerCase()}@example.test`,
      password: "owner-password-1",
    };
    await database.identity.createOrganizationOwner(organizationId, { ...owner, mustChangePassword: false });
    await use({ organizationId, code, name: "Sharma Travels", owner });
  },
  addStaff: async ({ database, agency }, use) => {
    const ownerAccess = async (): Promise<MemberAccess> => {
      const user = await database.platform.user.findUniqueOrThrow({ where: { email: agency.owner.email } });
      const access = await database.identity.resolveAccess(user.id, agency.organizationId);
      if (!access) throw new Error("the agency's owner has no access");
      return access;
    };
    await use(async ({ name, username, roleKey, mustChangePassword = false }) => {
      const password = `${username}-password-1`;
      const created = await database.identity.staff.create(await ownerAccess(), {
        name,
        username,
        roleKey,
        temporaryPassword: password,
      });
      if (!mustChangePassword) {
        await database.platform.user.update({ where: { id: created.userId }, data: { mustChangePassword: false } });
      }
      return { name, username, password };
    });
  },
});

export { expect };

/** The Home heading of a signed-in person: a greeting for the time of day and their first name (Home's greeting). */
export function homeGreeting(fullName: string): RegExp {
  const first = fullName.split(/\s+/)[0] ?? fullName;
  return new RegExp(`^Good (morning|afternoon|evening), ${first.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

/** Signs in through the api, as the sign-in screen does, so a journey can start inside the app. */
/**
 * A new organization's members meet the welcome over the app once. The journeys test the screens under it, so a
 * sign-in marks it seen, as closing it would (a person who must first change a password has no welcome yet: ignored).
 */
export async function skipWelcome(request: APIRequestContext): Promise<void> {
  await request.post("/api/trpc/usage.welcomeSeen", { data: {}, headers: { origin: environment("E2E_BASE_URL") } });
}

export async function signInByEmail(page: Page, { email, password }: { email: string; password: string }) {
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password },
    // The api accepts sign-ins only from the web app's own origin, which a browser would send.
    headers: { origin: environment("E2E_BASE_URL") },
  });
  expect(response.ok()).toBe(true);
  await skipWelcome(page.request);
}

/** Signs staff in with the organization code through the api, as the sign-in screen does. */
export async function signInByCode(page: Page, { code, staff }: { code: string; staff: Staff }) {
  const response = await page.request.post("/api/auth/sign-in/org", {
    data: { orgCode: code, username: staff.username, password: staff.password },
    headers: { origin: environment("E2E_BASE_URL") },
  });
  expect(response.ok()).toBe(true);
  await skipWelcome(page.request);
}

/** Signs out as a person does: from the phone's More sheet, or the button at the foot of the desktop's sidebar. */
export async function signOutOf(page: Page, { phone }: { phone: boolean }) {
  if (phone) await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).click();
}
