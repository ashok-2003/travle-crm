// Request check 2 over HTTP (spec 6.5, 7.3): what an organization's staff may do in each lifecycle state, what
// subscription.get tells them, and support's impersonation ending the moment its session does.
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { createPlatformAdmin, signedInOwner } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInByEmail,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("the subscription's request check", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  /** A test agency whose subscription is set as given, and its signed-in Owner. */
  async function agencyWith(subscription: {
    status: string;
    trialEndsOn?: Date | null;
    paidThrough?: Date | null;
  }): Promise<{ agency: TestAgency; owner: CookieJar }> {
    const agency = await createTestAgency(server);
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { statusChangedAt: new Date(), trialEndsOn: null, ...subscription },
    });
    return { agency, owner: await signedInOwner(server, agency) };
  }

  const changeTwoFactor = (jar: CookieJar) =>
    mutate(server, "settings.setTwoFactorRequirement", { required: false }, jar);

  it("lets a read-only organization's staff look but not change anything, and says until when", async () => {
    const { owner } = await agencyWith({ status: "read_only" });
    expect((await query(server, "settings.get", owner)).status).toBe(200);
    expect(await refusalOf(await changeTwoFactor(owner))).toEqual({ status: 403, reason: "ORGANIZATION_READ_ONLY" });
    const overview = await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner));
    expect(overview).toMatchObject({ status: "read_only", access: "read_only", planName: "Everything (tests)" });
    expect(overview.nextChangeOn).not.toBeNull();
  });

  it("lets a cancelled organization's staff sign in and see why, and nothing else", async () => {
    const { owner } = await agencyWith({ status: "cancelled" });
    expect((await query(server, "me.get", owner)).status).toBe(200);
    expect(await refusalOf(await query(server, "settings.get", owner))).toEqual({
      status: 403,
      reason: "ORGANIZATION_CANCELLED",
    });
    expect(await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).toMatchObject({
      status: "cancelled",
      access: "locked",
      nextChangeOn: null,
    });
  });

  it("counts a trial that ended yesterday as past due today, before the daily job has run", async () => {
    const yesterdayInIndia = calendarDateIn(new Date(Date.now() - DAY_MS), "Asia/Kolkata");
    const { owner } = await agencyWith({ status: "trial", trialEndsOn: new Date(`${yesterdayInIndia}T00:00:00Z`) });
    expect(await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).toMatchObject({
      status: "past_due",
      access: "full",
    });
    expect((await changeTwoFactor(owner)).status).toBe(200);
  });

  it("ends support's impersonation the moment its session is gone, though the cookie cache still holds it", async () => {
    const { agency } = await agencyWith({ status: "active", paidThrough: new Date(Date.now() + 365 * DAY_MS) });
    const admin = await createPlatformAdmin(server);
    const jar = new CookieJar();
    await signInByEmail(server, jar, admin.email, admin.password);
    jar.absorb(await postJson(server, "/api/auth/admin/impersonate-user", { userId: agency.owner.userId }, jar));
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    await server.platform.session.deleteMany({ where: { impersonatedBy: admin.userId } });
    expect((await query(server, "me.get", jar)).status).toBe(401);
    expect((await query(server, "settings.get", jar)).status).toBe(401);
  });
});
