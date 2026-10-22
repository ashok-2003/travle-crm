// What the website form's route tests share: an agency with its form switched on, the calls a visitor's page makes, a
// token as old as a test needs, and a counting limiter that is cheap enough for the 61st call.
import { randomInt, randomUUID } from "node:crypto";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import {
  formKeyOf,
  formTokenKey,
  readWebsiteForm,
  setWebsiteFormEnabled,
  signOpenedToken,
} from "@travel-crm/domain/website-forms";
import { expect } from "vitest";
import { ownerAccess } from "./people.js";
import { createTestAgency, ORIGIN, testAuthSettings, type TestAgency, type TestServer } from "./test-server.js";

export interface OpenForm {
  agency: TestAgency;
  formId: string;
  key: string;
}

/** A test agency whose form is switched on (through the module's own function, as the settings screen would). */
export async function agencyWithOpenForm(server: TestServer): Promise<OpenForm> {
  const agency = await createTestAgency(server);
  const actor = await ownerAccess(server, agency);
  const form = await server.db.forOrg(agency.organizationId, async (tx) => {
    await setWebsiteFormEnabled(tx, actor, true);
    const saved = await readWebsiteForm(tx);
    if (saved === null) throw new Error("the form was not made");
    return saved;
  });
  return { agency, formId: form.id, key: formKeyOf(agency.organizationId, form.keySecret) };
}

/** An address of its own, so the address limits (shared across the run's database) never meet between tests. */
export function freshAddress(): string {
  return `10.${String(randomInt(1, 255))}.${String(randomInt(0, 255))}.${String(randomInt(1, 255))}`;
}

export const freshPhone = (): string => `+9198${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;

/** A token for the form, signed `ageMs` ago with the test server's secret. */
export function openedTokenFor(formId: string, ageMs = 10_000): string {
  return signOpenedToken(formTokenKey(testAuthSettings.secret), formId, new Date(Date.now() - ageMs));
}

export function enquiryFor(formId: string, overrides: Record<string, unknown> = {}) {
  return {
    submissionId: randomUUID(),
    openedToken: openedTokenFor(formId),
    via: "hosted",
    homepage: "",
    answers: { name: "Meera Iyer", phone: freshPhone() },
    ...overrides,
  };
}

function expectNoCors(response: Response): void {
  for (const [name] of response.headers) expect(name).not.toMatch(/^access-control-/);
}

export async function getForm(
  server: TestServer,
  key: string,
  address: string | null = freshAddress(),
): Promise<Response> {
  const response = await server.app.request(`/api/public/website-forms/${key}`, {
    headers: address === null ? {} : { "x-forwarded-for": address },
  });
  expectNoCors(response);
  return response;
}

export async function postEnquiry(
  server: TestServer,
  key: string,
  body: unknown,
  options: { address?: string | null; headers?: Record<string, string>; raw?: string } = {},
): Promise<Response> {
  const address = options.address === undefined ? freshAddress() : options.address;
  const response = await server.app.request(`/api/public/website-forms/${key}/enquiries`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      ...(address === null ? {} : { "x-forwarded-for": address }),
      ...options.headers,
    },
    body: options.raw ?? JSON.stringify(body),
  });
  expectNoCors(response);
  return response;
}

/** A fixed-window limiter in memory that remembers every key it was asked about. */
export function countingLimiter(): RateLimiter & { keys: string[] } {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  return {
    keys,
    hit: (key, rule) => {
      keys.push(key);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return Promise.resolve(
        count <= rule.limit
          ? { allowed: true, remaining: rule.limit - count, retryAfterSeconds: 0 }
          : { allowed: false, remaining: 0, retryAfterSeconds: rule.windowSeconds },
      );
    },
  };
}

/** A plan with no crm module, for the "plan" closed state. */
export async function planWithoutCrm(server: TestServer): Promise<PlanSummary["id"]> {
  const plan = await server.platform.plan.create({
    data: {
      key: `no-crm-${randomUUID().slice(0, 8)}`,
      name: "No crm (tests)",
      monthlyPricePaise: 0,
      seatLimit: 5,
      whatsappNumberLimit: 1,
      storageLimitBytes: 1_000_000n,
      modules: ["quotes"],
    },
    select: { id: true },
  });
  return plan.id;
}
