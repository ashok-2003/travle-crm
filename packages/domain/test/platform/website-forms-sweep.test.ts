// The hourly sweep of the website form's ledger (spec 7.2): rows older than 90 days go, newer ones stay, a backlog of more
// than a page goes in one run, a second run finds nothing to do, and no other table is touched. It runs on a database of
// its own: the sweep takes every due row of every organization.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createIsolatedDatabase, createTestOrganization, type IsolatedDatabase } from "@travel-crm/db/testing";
import { createMemoryJobAdministration, createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createPlatformServices,
  sweepWebsiteFormsNow,
  websiteFormsSweepSchedule,
  type PlatformServices,
} from "../../src/platform/index.js";
import { createTestIdentity, type TestIdentity } from "../identity/test-identity.js";
import { aPerson } from "../crm/support/records.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-20T10:00:00Z");

describe("the hourly sweep of the website form's ledger", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let identity: TestIdentity;
  let services: PlatformServices;

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
    identity = createTestIdentity();
    services = createPlatformServices({
      platformDatabaseUrl: isolated.urls.platform,
      maxConnections: 2,
      db,
      identity: identity.identity,
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
    await identity.close();
    await isolated.drop();
  });

  /** A form with a person, and a ledger row for each age in days (a day is 24 hours before now). */
  async function ledger(agesInDays: number[]) {
    const organizationId = await createTestOrganization(platform, "Sweep Holidays");
    const personId = await db.forOrg(organizationId, async (tx) => {
      const form = await tx.websiteForm.create({ data: { keySecret: "abcdefghijklmnop" }, select: { id: true } });
      const person = await aPerson(tx);
      await tx.personConsent.create({
        data: {
          personId: person.id,
          purpose: "marketing",
          action: "granted",
          wording: "Send me offers",
          wordingVersion: 1,
          source: "web_form",
          sourceFormId: form.id,
        },
      });
      await tx.websiteFormSubmission.createMany({
        data: agesInDays.map((age) => ({
          formId: form.id,
          submissionId: randomUUID(),
          outcome: "spam",
          reason: "honeypot",
          createdAt: new Date(now.getTime() - age * DAY_MS),
        })),
      });
      return person.id;
    });
    return { organizationId, personId };
  }

  const rowsOf = (organizationId: string) => platform.websiteFormSubmission.count({ where: { organizationId } });

  it("deletes ledger rows older than 90 days and keeps newer ones", async () => {
    const { organizationId } = await ledger([120, 91, 89, 10, 0]);

    const swept = await sweepWebsiteFormsNow(services, now);

    expect(swept.ledgerRowsDeleted).toBeGreaterThanOrEqual(2);
    const ages = (await platform.websiteFormSubmission.findMany({ where: { organizationId } })).map((row) =>
      Math.round((now.getTime() - row.createdAt.getTime()) / DAY_MS),
    );
    expect(ages.sort((a, b) => b - a)).toEqual([89, 10, 0]);
  });

  it("pages through a backlog, and a second run finds nothing", async () => {
    const { organizationId } = await ledger(Array.from({ length: 450 }, () => 100));
    const kept = await ledger([5]);

    const first = await sweepWebsiteFormsNow(services, now);
    const second = await sweepWebsiteFormsNow(services, now);

    expect(first.ledgerRowsDeleted).toBeGreaterThanOrEqual(450);
    expect(second).toEqual({ ledgerRowsDeleted: 0 });
    expect(await rowsOf(organizationId)).toBe(0);
    expect(await rowsOf(kept.organizationId)).toBe(1);
  });

  it("never touches another table", async () => {
    const { organizationId, personId } = await ledger([200]);
    const before = [
      await platform.personConsent.count(),
      await platform.person.count(),
      await platform.websiteForm.count(),
    ];

    await sweepWebsiteFormsNow(services, now);

    expect(await rowsOf(organizationId)).toBe(0);
    expect([
      await platform.personConsent.count(),
      await platform.person.count(),
      await platform.websiteForm.count(),
    ]).toEqual(before);
    expect(await platform.personConsent.count({ where: { personId } })).toBe(1);
  });

  it("is scheduled hourly at 47 past, India time", () => {
    expect(websiteFormsSweepSchedule(services)).toMatchObject({
      queue: "platform.sweep-website-forms",
      cron: "47 * * * *",
      timeZone: "Asia/Kolkata",
    });
  });
});
