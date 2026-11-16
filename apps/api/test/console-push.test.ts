// The console's web push over HTTP: super admins only, never support; a super admin reads the key, saves a browser and
// removes it, and a browser another person used moves to whoever subscribes last.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("the console's web push", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;
  const endpoint = `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`;
  const subscription = { endpoint, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  const rows = () => server.platform.platformPushSubscription.findMany({ where: { endpoint } });

  it("refuses support every call, and anyone signed out", async () => {
    for (const response of [
      await consoleQuery(testConsole, "push.publicKey", support.jar, undefined),
      await consoleMutate(testConsole, "push.subscribe", subscription, support.jar),
      await consoleMutate(testConsole, "push.unsubscribe", { endpoint }, support.jar),
    ]) {
      expect(await refusalOf(response)).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    }
    expect((await consoleQuery(testConsole, "push.publicKey", undefined, undefined)).status).toBe(401);
    expect(await rows()).toEqual([]);
  });

  it("gives a super admin the key, and saves and removes their browser", async () => {
    expect(await dataOf<string>(await consoleQuery(testConsole, "push.publicKey", superAdmin.jar, undefined))).toBe(
      "test-vapid-public-key",
    );
    expect((await consoleMutate(testConsole, "push.subscribe", subscription, superAdmin.jar)).status).toBe(200);
    expect(await rows()).toEqual([expect.objectContaining({ userId: superAdmin.userId })]);
    expect((await consoleMutate(testConsole, "push.unsubscribe", { endpoint }, superAdmin.jar)).status).toBe(200);
    expect(await rows()).toEqual([]);
  });

  it("refuses an unknown push service and an input with unknown keys", async () => {
    const elsewhere = { ...subscription, endpoint: "https://internal.example/push" };
    expect((await consoleMutate(testConsole, "push.subscribe", elsewhere, superAdmin.jar)).status).toBe(400);
    expect((await consoleMutate(testConsole, "push.unsubscribe", { endpoint, extra: 1 }, superAdmin.jar)).status).toBe(
      400,
    );
  });

  it("forgets a staff member's browsers when they are demoted or removed", async () => {
    const demoted = await signedInPlatformStaff(server, "super-admin");
    const removed = await signedInPlatformStaff(server, "super-admin");
    const browser = (id: string) => ({ ...subscription, endpoint: `${endpoint}/${id}` });
    for (const person of [demoted, removed]) {
      await consoleMutate(testConsole, "push.subscribe", browser(person.userId), person.jar);
    }
    const count = () =>
      server.platform.platformPushSubscription.count({ where: { userId: { in: [demoted.userId, removed.userId] } } });
    expect(await count()).toBe(2);
    const change = (path: string, input: unknown) => consoleMutate(testConsole, path, input, superAdmin.jar);
    expect((await change("platformStaff.setLevel", { userId: demoted.userId, level: "support" })).status).toBe(200);
    expect(await count()).toBe(1);
    expect((await change("platformStaff.remove", { userId: removed.userId })).status).toBe(200);
    expect(await count()).toBe(0);
  });
});
