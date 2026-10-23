// The console's hourly sweep of WhatsApp's stored webhook events (ADR 0035, W5): the payload of an event processed more than a
// week ago is blanked, routed or not, its id kept so a replay is still ignored; newer and unprocessed events stay; other
// providers' events are not touched. It runs on a database of its own: the sweep takes every due row.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createIsolatedDatabase, type IsolatedDatabase } from "@travel-crm/db/testing";
import { createMemoryJobAdministration, createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createPlatformServices,
  sweepWhatsAppNow,
  whatsappSweepSchedule,
  type PlatformServices,
} from "../../src/platform/index.js";
import { createTestIdentity } from "../identity/test-identity.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-20T10:00:00Z");

describe("the hourly sweep of WhatsApp's stored events", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let services: PlatformServices;

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
    services = createPlatformServices({
      platformDatabaseUrl: isolated.urls.platform,
      maxConnections: 2,
      db,
      identity: createTestIdentity().identity,
      storage: createMemoryStorage(),
      queue: createMemoryJobQueue(),
      jobs: createMemoryJobAdministration(),
      logger: createMemoryLogger(),
    });
  }, 120_000);

  afterAll(async () => {
    await services.platformDb.disconnect();
    await db.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  const event = (provider: string, processedDaysAgo: number | null) =>
    platform.webhookEvent.create({
      data: {
        provider,
        providerEventId: randomUUID(),
        eventType: "text",
        headers: {},
        payload: '{"text":"private words"}',
        processedAt: processedDaysAgo === null ? null : new Date(now.getTime() - processedDaysAgo * DAY_MS),
      },
    });

  it("blanks events processed over a week ago and keeps their ids, leaving the rest alone", async () => {
    const [old, recent, open, other] = [
      await event("msg91-whatsapp", 8),
      await event("msg91-whatsapp", 2),
      await event("msg91-whatsapp", null),
      await event("razorpay", 30),
    ];
    expect(await sweepWhatsAppNow(services, now)).toEqual({ blanked: 1 });
    const read = async (id: string) => platform.webhookEvent.findUniqueOrThrow({ where: { id } });
    expect((await read(old.id)).payload).toBe("");
    expect((await read(old.id)).providerEventId).toBe(old.providerEventId);
    expect((await read(recent.id)).payload).not.toBe("");
    expect((await read(open.id)).payload).not.toBe("");
    expect((await read(other.id)).payload).not.toBe("");
    expect(await sweepWhatsAppNow(services, now)).toEqual({ blanked: 0 });
  });

  it("is an hourly schedule", () => {
    expect(whatsappSweepSchedule(services)).toMatchObject({ queue: "platform.sweep-whatsapp", cron: "41 * * * *" });
  });
});
