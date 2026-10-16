// Choosing what reaches you over HTTP (spec 9.4, DPDP): every member turns email or push off and on again, for one
// kind or for everything, and sees their choices; they are their own, so support impersonating them can't change
// them, and opting out works whatever the organization's subscription allows, cancelled included.
import type { NotificationPreference } from "@travel-crm/contracts/notifications";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signedInPlatformStaff, signInPlatformStaffAgain } from "./support/console.js";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, postJson, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("notification preferences", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  const listed = async (jar: CookieJar) =>
    dataOf<NotificationPreference[]>(await query(server, "notifications.preferences.list", jar));
  const choose = (jar: CookieJar, choice: NotificationPreference) =>
    mutate(server, "notifications.preferences.set", choice, jar);

  it("turns email or push off and on again, for one kind or for everything, for any member", async () => {
    const agency = await createTestAgency(server);
    const sales = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const ravi = await signedInStaff(server, agency, sales);
    expect(await listed(ravi)).toEqual([]);

    const pushOff = { channel: "push", kind: "*", optedOut: true } as const;
    expect(await dataOf(await choose(ravi, pushOff))).toEqual(pushOff);
    await dataOf(await choose(ravi, { channel: "email", kind: "share-link.opened", optedOut: true }));
    await dataOf(await choose(ravi, { channel: "email", kind: "share-link.opened", optedOut: false }));
    expect(await listed(ravi)).toEqual([
      { channel: "email", kind: "share-link.opened", optedOut: false },
      { channel: "push", kind: "*", optedOut: true },
    ]);
    // The Owner's choices are the Owner's.
    expect(await listed(await signedInOwner(server, agency))).toEqual([]);
  });

  it("refuses a kind that isn't one, and the bell, which can't be turned off", async () => {
    const owner = await signedInOwner(server, await createTestAgency(server));
    expect((await choose(owner, { channel: "email", kind: "everything", optedOut: true })).status).toBe(400);
    const bell = await mutate(
      server,
      "notifications.preferences.set",
      { channel: "bell", kind: "*", optedOut: true },
      owner,
    );
    expect(bell.status).toBe(400);
  });

  it("lets support impersonating a member read their choices, but not change them", async () => {
    const agency = await createTestAgency(server);
    const staff = await signedInPlatformStaff(server);
    const jar = await signInPlatformStaffAgain(server, staff);
    const started = jar.absorb(
      await postJson(server, "/api/auth/admin/impersonate-user", { userId: agency.owner.userId }, jar),
    );
    expect(started.status).toBe(200);
    expect(await listed(jar)).toEqual([]);
    expect(await refusalOf(await choose(jar, { channel: "email", kind: "*", optedOut: true }))).toEqual({
      status: 403,
      reason: "IMPERSONATING",
    });
  });

  it("lets a member opt out whatever the subscription allows, cancelled included", async () => {
    const agency = await createTestAgency(server);
    const owner = await signedInOwner(server, agency);
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "cancelled", statusChangedAt: new Date() },
    });
    // Everything else is refused now...
    expect(await refusalOf(await query(server, "notifications.unreadCount", owner))).toEqual({
      status: 403,
      reason: "ORGANIZATION_CANCELLED",
    });
    // ...but consent is the person's: the emails' unsubscribe link leads here.
    await dataOf(await choose(owner, { channel: "email", kind: "*", optedOut: true }));
    expect(await listed(owner)).toEqual([{ channel: "email", kind: "*", optedOut: true }]);
  });
});
