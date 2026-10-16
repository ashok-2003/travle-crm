// Web push over HTTP (spec 9.4): the browser learns the VAPID public key from the api, so one build of the web app
// serves every environment; a member saves their browser's subscription and removes it again, never another's; only
// the browsers' own push services are accepted; support impersonating a member can't subscribe, or the member's pushes
// would reach support's browser; and removing one works whatever the subscription allows, as signing out does.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signedInPlatformStaff, signInPlatformStaffAgain } from "./support/console.js";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  TEST_PUSH_PUBLIC_KEY,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

/** A browser's subscription as PushSubscription.toJSON() gives it. */
const browser = (name: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${name}-${crypto.randomUUID()}`,
  expirationTime: null,
  keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
});

describe("web push", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  /** Whose browser the endpoint is, as the worker will read it; null when it is nobody's. */
  const ownerOf = async (agency: TestAgency, endpoint: string) =>
    (
      await server.db.forOrg(agency.organizationId, (tx) =>
        tx.pushSubscription.findFirst({ where: { endpoint }, select: { userId: true } }),
      )
    )?.userId ?? null;
  const subscribe = (jar: CookieJar, subscription: ReturnType<typeof browser>) =>
    mutate(server, "notifications.push.subscribe", subscription, jar);
  const unsubscribe = (jar: CookieJar, endpoint: string) =>
    mutate(server, "notifications.push.unsubscribe", { endpoint }, jar);

  it("gives the browser the VAPID public key it subscribes with", async () => {
    const owner = await signedInOwner(server, await createTestAgency(server));
    expect(await dataOf(await query(server, "notifications.push.publicKey", owner))).toBe(TEST_PUSH_PUBLIC_KEY);
  });

  it("saves a member's browser, and removes it again, never another person's", async () => {
    const agency = await createTestAgency(server);
    const sales = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const owner = await signedInOwner(server, agency);
    const ravi = await signedInStaff(server, agency, sales);
    const ownersPhone = browser("owner");
    const ravisPhone = browser("ravi");
    expect((await subscribe(owner, ownersPhone)).status).toBe(200);
    expect((await subscribe(ravi, ravisPhone)).status).toBe(200);
    expect(await ownerOf(agency, ownersPhone.endpoint)).toBe(agency.owner.userId);
    expect(await ownerOf(agency, ravisPhone.endpoint)).toBe(sales.userId);

    // Ravi's phone isn't the Owner's to remove.
    expect((await unsubscribe(owner, ravisPhone.endpoint)).status).toBe(200);
    expect((await unsubscribe(owner, ownersPhone.endpoint)).status).toBe(200);
    expect(await ownerOf(agency, ownersPhone.endpoint)).toBeNull();
    expect(await ownerOf(agency, ravisPhone.endpoint)).toBe(sales.userId);
  });

  it("accepts only the browsers' own push services, over https", async () => {
    const owner = await signedInOwner(server, await createTestAgency(server));
    const plain = { ...browser("plain"), endpoint: "http://fcm.googleapis.com/fcm/send/x" };
    expect((await subscribe(owner, plain)).status).toBe(400);
    const elsewhere = { ...browser("elsewhere"), endpoint: "https://push.example/send/x" };
    expect(await refusalOf(await subscribe(owner, elsewhere))).toEqual({
      status: 400,
      reason: "INVALID_PUSH_SUBSCRIPTION",
    });
  });

  it("refuses support impersonating a member a subscription, so the member's pushes never reach support", async () => {
    const agency = await createTestAgency(server);
    const staff = await signedInPlatformStaff(server);
    const jar = await signInPlatformStaffAgain(server, staff);
    const started = jar.absorb(
      await postJson(server, "/api/auth/admin/impersonate-user", { userId: agency.owner.userId }, jar),
    );
    expect(started.status).toBe(200);
    const supportsLaptop = browser("support");
    expect(await refusalOf(await subscribe(jar, supportsLaptop))).toEqual({ status: 403, reason: "IMPERSONATING" });
    expect(await ownerOf(agency, supportsLaptop.endpoint)).toBeNull();
  });

  it("removes a browser whatever the subscription allows, as signing out of a cancelled organization does", async () => {
    const agency = await createTestAgency(server);
    const owner = await signedInOwner(server, agency);
    const phone = browser("cancelled");
    expect((await subscribe(owner, phone)).status).toBe(200);
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "cancelled", statusChangedAt: new Date() },
    });
    expect(await dataOf(await query(server, "notifications.push.publicKey", owner))).toBe(TEST_PUSH_PUBLIC_KEY);
    expect((await unsubscribe(owner, phone.endpoint)).status).toBe(200);
    expect(await ownerOf(agency, phone.endpoint)).toBeNull();
  });
});
