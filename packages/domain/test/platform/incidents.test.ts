// The system's health: a report opens an incident of its kind, a second report of an open one is counted on it, the
// incident jobs every process sends are recorded, and the list says what is open.
import { randomUUID } from "node:crypto";
import { incidentKinds, type IncidentKind } from "@travel-crm/contracts/platform";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { platformStaffRoles } from "../../src/identity/index.js";
import {
  incidentHandler,
  listPlatformIncidents,
  reportPlatformIncident,
  removePlatformPushSubscription,
  savePlatformPushSubscription,
} from "../../src/platform/index.js";
import { emailLongAiIncidents, resolveQuiet } from "../../src/platform/incidents.js";
import { createPlatformAdmin } from "../identity/test-identity.js";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

describe("the system's health", () => {
  let test: TestPlatform;
  beforeAll(() => {
    test = createTestPlatform();
  });
  afterAll(async () => {
    await test.close();
  });

  it("opens one incident per kind, and counts the reports of an open one", async () => {
    const now = new Date();
    await reportPlatformIncident(test.services, "ai.unavailable", "autopilot", now);
    await reportPlatformIncident(test.services, "ai.unavailable", "score_lead", new Date(now.getTime() + 60_000));
    const { open } = await listPlatformIncidents(test.services);
    const ai = open.filter((incident) => incident.kind === "ai.unavailable");
    expect(ai).toHaveLength(1);
    expect(ai[0]).toMatchObject({ detail: "score_lead", reports: 2, resolvedAt: null });
  });

  it("emails each super admin when one opens, as a platform incident in the email log", async () => {
    const admin = await createPlatformAdmin(test.identity, "super-password-1");
    await test.identity.database.client.user.update({
      where: { id: admin.userId },
      data: { role: platformStaffRoles["super-admin"] },
    });
    await reportPlatformIncident(test.services, "worker.stalled", "", new Date());
    const toAdmin = test.emails.sent.filter((message) => message.to.address === admin.email);
    expect(toAdmin.map((message) => [message.subject, message.purpose])).toEqual([
      ["Platform alert: The worker isn't taking jobs", "platform-incident"],
    ]);
  });

  it("records the incident jobs every process sends, and refuses one of no known kind", async () => {
    const handler = incidentHandler(test.services);
    await handler.handle({ kind: "api.errors", detail: "/api/trpc TypeError" });
    const { open } = await listPlatformIncidents(test.services);
    expect(open.map((incident) => incident.kind)).toContain("api.errors");
    await expect(handler.handle({ kind: "disk.full", detail: "" })).rejects.toThrow();
  });

  it("stores an incident of every kind the contracts name (the table's CHECK keeps up with them)", async () => {
    // Live, 28 Nov: whatsapp.refused was in the contracts but not the CHECK, so every report of it failed.
    for (const kind of incidentKinds) await reportPlatformIncident(test.services, kind, "every kind", new Date());
    const { open } = await listPlatformIncidents(test.services);
    expect(new Set(open.map((incident) => incident.kind))).toEqual(new Set(incidentKinds));
  });
});

describe("the super admins' alerts (the owner, 2026-11-17)", () => {
  let test: TestPlatform;
  let adminId: string;
  let adminEmail: string;
  let endpoint: string;
  const MINUTE = 60_000;

  beforeAll(() => {
    test = createTestPlatform();
  });
  afterAll(async () => {
    await test.close();
  });

  beforeEach(async () => {
    await test.services.platformDb.transaction((tx) =>
      tx.platformIncident.updateMany({ where: { resolvedAt: null }, data: { resolvedAt: new Date() } }),
    );
    const admin = await createPlatformAdmin(test.identity, "super-password-1");
    await test.identity.database.client.user.update({
      where: { id: admin.userId },
      data: { role: platformStaffRoles["super-admin"] },
    });
    adminId = admin.userId;
    adminEmail = admin.email;
    endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await savePlatformPushSubscription(test.services, { userId: adminId }, subscription(endpoint));
  });

  const subscription = (address: string) => ({
    endpoint: address,
    keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
  });
  const pushesToAdmin = () => test.push.sent.filter((sent) => sent.subscription.endpoint === endpoint);
  const emailsToAdmin = () => test.emails.sent.filter((message) => message.to.address === adminEmail);
  const emailedAt = async (kind: IncidentKind) =>
    (
      await test.services.platformDb.transaction((tx) =>
        tx.platformIncident.findFirstOrThrow({ where: { kind, resolvedAt: null }, select: { emailedAt: true } }),
      )
    ).emailedAt;

  it("pushes to the super admin when any kind opens", async () => {
    await reportPlatformIncident(test.services, "ai.unavailable", "autopilot", new Date());
    await reportPlatformIncident(test.services, "jobs.failed", "x", new Date());
    expect(pushesToAdmin().map((sent) => sent.payload)).toEqual([
      expect.objectContaining({ title: "Platform alert: The AI isn't answering", url: "/console/updates" }),
      expect.objectContaining({ title: "Platform alert: Background jobs are failing", url: "/console/updates" }),
    ]);
  });

  it("emails at once for a kind that is not the AI's, and waits for the AI's", async () => {
    await reportPlatformIncident(test.services, "ai.rate-limited", "", new Date());
    await reportPlatformIncident(test.services, "api.errors", "", new Date());
    expect(emailsToAdmin().map((message) => message.subject)).toEqual(["Platform alert: The api is hitting errors"]);
    expect(await emailedAt("api.errors")).not.toBeNull();
    expect(await emailedAt("ai.rate-limited")).toBeNull();
  });

  it("emails an AI incident once, when it has lasted half an hour", async () => {
    const opened = new Date();
    await reportPlatformIncident(test.services, "ai.unavailable", "", opened);
    await emailLongAiIncidents(test.services, new Date(opened.getTime() + 29 * MINUTE));
    expect(emailsToAdmin()).toHaveLength(0);
    await emailLongAiIncidents(test.services, new Date(opened.getTime() + 30 * MINUTE));
    await emailLongAiIncidents(test.services, new Date(opened.getTime() + 35 * MINUTE));
    expect(emailsToAdmin().map((message) => message.subject)).toEqual(["Still happening: The AI isn't answering"]);
    expect(await emailedAt("ai.unavailable")).not.toBeNull();
  });

  it("pushes when it resolves, and emails only if the super admins were emailed about it", async () => {
    const opened = new Date(Date.now() - 2 * 60 * MINUTE);
    await reportPlatformIncident(test.services, "ai.unavailable", "", opened);
    await reportPlatformIncident(test.services, "ai.rate-limited", "", opened);
    await emailLongAiIncidents(test.services, new Date(opened.getTime() + 31 * MINUTE));
    await test.services.platformDb.transaction((tx) =>
      tx.platformIncident.updateMany({
        where: { resolvedAt: null, kind: "ai.rate-limited" },
        data: { emailedAt: null },
      }),
    );
    const before = emailsToAdmin().length;
    await resolveQuiet(test.services, new Date());
    expect(pushesToAdmin().map((sent) => sent.payload.title)).toEqual(
      expect.arrayContaining(["Back to normal: The AI isn't answering", "Back to normal: The AI's limit is used up"]),
    );
    expect(
      emailsToAdmin()
        .slice(before)
        .map((message) => message.subject),
    ).toEqual(["Back to normal: The AI isn't answering"]);
  });

  it("deletes a subscription the push service says is gone", async () => {
    test.push.markGone(endpoint);
    await reportPlatformIncident(test.services, "jobs.failed", "", new Date());
    const rows = await test.services.platformDb.transaction((tx) =>
      tx.platformPushSubscription.count({ where: { endpoint } }),
    );
    expect(rows).toBe(0);
  });

  it("still emails, and logs the failure by name, when the push throws", async () => {
    test.push.failNext(1);
    await reportPlatformIncident(test.services, "worker.stalled", "", new Date());
    expect(emailsToAdmin()).toHaveLength(1);
    expect(test.logger.entries.some((entry) => entry.msg.includes("push"))).toBe(true);
  });

  it("moves a browser to the person who subscribes last, and unsubscribes only its own person", async () => {
    const other = await createPlatformAdmin(test.identity, "super-password-1");
    await savePlatformPushSubscription(test.services, { userId: other.userId }, subscription(endpoint));
    await removePlatformPushSubscription(test.services, { userId: adminId }, { endpoint });
    const owner = () =>
      test.services.platformDb.transaction((tx) => tx.platformPushSubscription.findUnique({ where: { endpoint } }));
    expect((await owner())?.userId).toBe(other.userId);
    await removePlatformPushSubscription(test.services, { userId: other.userId }, { endpoint });
    expect(await owner()).toBeNull();
  });

  it("refuses an endpoint that is not a browser's push service", async () => {
    await expect(
      savePlatformPushSubscription(test.services, { userId: adminId }, subscription("https://internal.example/x")),
    ).rejects.toMatchObject({ reason: "INVALID_PUSH_SUBSCRIPTION" });
  });
});
