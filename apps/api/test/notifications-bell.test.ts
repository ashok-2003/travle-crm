// The bell over HTTP (spec 9.4): every member, whatever their role, sees their own notifications, newest first and a
// page at a time, with the unread count, and marks one or all read; nobody sees or marks another person's. Support
// impersonating a member sees the bell but can't mark it read, and a read-only organization's members still clear it.
import type { NotificationPage } from "@travel-crm/contracts/notifications";
import { systemActor } from "@travel-crm/domain/kernel";
import { notify } from "@travel-crm/domain/notifications";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signedInPlatformStaff, signInPlatformStaffAgain } from "./support/console.js";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("the bell", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  /** Tells one person something, as a listener would: the ids of what it created. */
  function tell(agency: TestAgency, userId: string, title: string, link?: string): Promise<string[]> {
    return server.db.forOrg(agency.organizationId, (tx) =>
      notify(tx, systemActor(agency.organizationId), {
        recipientUserIds: [userId],
        kind: "share-link.opened",
        title,
        body: "The link you shared has just been opened.",
        ...(link === undefined ? {} : { link }),
      }),
    );
  }

  const page = async (jar: CookieJar, input: { cursor?: string; limit?: number } = {}) =>
    dataOf<NotificationPage>(await query(server, "notifications.list", jar, input));
  const unread = async (jar: CookieJar) => dataOf<number>(await query(server, "notifications.unreadCount", jar));

  it("shows each member their own notifications, newest first, a page at a time, with the unread count", async () => {
    const agency = await createTestAgency(server);
    const sales = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    for (const title of ["Opened: Quotation 1", "Opened: Quotation 2", "Opened: Quotation 3"]) {
      await tell(agency, agency.owner.userId, title, "/settings/documents");
    }
    await tell(agency, sales.userId, "Opened: Ravi's quotation");
    const owner = await signedInOwner(server, agency);

    const first = await page(owner, { limit: 2 });
    expect(first.notifications.map(({ title }) => title)).toEqual(["Opened: Quotation 3", "Opened: Quotation 2"]);
    expect(first.notifications[0]).toMatchObject({
      kind: "share-link.opened",
      link: "/settings/documents",
      readAt: null,
    });
    expect(first.nextCursor).toBe(first.notifications[1]?.id);
    const second = await page(owner, { limit: 2, ...(first.nextCursor ? { cursor: first.nextCursor } : {}) });
    expect(second).toMatchObject({ notifications: [{ title: "Opened: Quotation 1" }], nextCursor: null });
    expect(await unread(owner)).toBe(3);

    // A salesperson holds no permission for it: the bell is every member's.
    const ravi = await signedInStaff(server, agency, sales);
    expect((await page(ravi)).notifications).toEqual([expect.objectContaining({ title: "Opened: Ravi's quotation" })]);
    expect(await unread(ravi)).toBe(1);
  });

  it("marks one or all read, and never another person's", async () => {
    const agency = await createTestAgency(server);
    const sales = await addStaff(server, agency, { username: "meera", roleKey: "sales" });
    const [mine = "", alsoMine = ""] = [
      ...(await tell(agency, agency.owner.userId, "Opened: one")),
      ...(await tell(agency, agency.owner.userId, "Opened: two")),
    ];
    const [theirs = ""] = await tell(agency, sales.userId, "Opened: Meera's");
    const owner = await signedInOwner(server, agency);

    expect(
      await dataOf(await mutate(server, "notifications.markRead", { notificationIds: [mine, theirs] }, owner)),
    ).toBe(1);
    expect(await unread(owner)).toBe(1);
    const listed = (await page(owner)).notifications;
    expect(listed.find(({ id }) => id === mine)?.readAt).toEqual(expect.any(String));
    expect(listed.find(({ id }) => id === alsoMine)?.readAt).toBeNull();

    expect(await dataOf(await mutate(server, "notifications.markRead", { all: true }, owner))).toBe(1);
    expect(await unread(owner)).toBe(0);
    // Meera's is still unread: the Owner's "all" is all of the Owner's.
    expect(await unread(await signedInStaff(server, agency, sales))).toBe(1);
  });

  it("lets support impersonating a member see the bell, but not mark it read", async () => {
    const agency = await createTestAgency(server);
    await tell(agency, agency.owner.userId, "Opened: for the Owner");
    const staff = await signedInPlatformStaff(server);
    const jar = await signInPlatformStaffAgain(server, staff);
    const started = jar.absorb(
      await postJson(server, "/api/auth/admin/impersonate-user", { userId: agency.owner.userId }, jar),
    );
    expect(started.status).toBe(200);

    expect(await unread(jar)).toBe(1);
    expect(await refusalOf(await mutate(server, "notifications.markRead", { all: true }, jar))).toEqual({
      status: 403,
      reason: "IMPERSONATING",
    });
    expect(await unread(await signedInOwner(server, agency))).toBe(1);
  });

  it("lets a read-only organization's members read and clear their bell", async () => {
    const agency = await createTestAgency(server);
    await tell(agency, agency.owner.userId, "Opened: while read-only");
    const owner = await signedInOwner(server, agency);
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "read_only", statusChangedAt: new Date() },
    });
    expect((await page(owner)).notifications).toHaveLength(1);
    expect(await dataOf(await mutate(server, "notifications.markRead", { all: true }, owner))).toBe(1);
  });

  it("refuses a page bigger than the bell shows, and an empty mark", async () => {
    const owner = await signedInOwner(server, await createTestAgency(server));
    expect((await query(server, "notifications.list", owner, { limit: 51 })).status).toBe(400);
    expect((await mutate(server, "notifications.markRead", { notificationIds: [] }, owner)).status).toBe(400);
  });
});
