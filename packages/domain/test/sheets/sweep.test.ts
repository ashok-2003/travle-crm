// The console's sweep of the Sheets sync (S5, S6, S31): drafts untouched for a day go with what they read, schedule rows and claims nothing live holds; a fresh draft, a connected sheet and an unresolved problem stay.
// It runs on a database of its own: the sweep reads across every organization.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createIsolatedDatabase, createTestOrganization, type IsolatedDatabase } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { sweepSheetsNow, SWEEP_SHEETS_QUEUE, sheetsSweepSchedule } from "../../src/platform/index.js";
import type { PlatformServices } from "../../src/platform/index.js";
import { createSheetsHashes, sweepSheets } from "../../src/sheets/index.js";
import {
  dropStaleScheduleRows,
  dropUnusedClaims,
  scheduleRowOf,
  upsertScheduleRow,
} from "../../src/sheets/schedule.js";
import { takeSpreadsheetClaim } from "../../src/sheets/index.js";
import { aSheet, aSheetColumn, aSheetRow, aSpreadsheetId, sheetsHashKey } from "./support/sheets.js";

const DAY = 24 * 60 * 60 * 1000;
const userId = "0199e7a0-0000-7000-8000-0000000000d1";

describe("the sheets sweep", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationId: string;
  const hashes = createSheetsHashes(sheetsHashKey);
  const now = new Date("2026-10-25T10:00:00Z");

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    platformDb = createPlatformDatabase(isolated.urls.platform, { maxConnections: 2 });
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Sweep agency");
  }, 120_000);

  afterAll(async () => {
    await platformDb.disconnect();
    await db.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  const run = () => platformDb.transaction((tx) => sweepSheets(tx, now, 200));

  it("deletes a draft untouched for 24 hours with its columns, and keeps a fresh one and a connected sheet", async () => {
    const stale = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const fresh = new Date(now.getTime() - 60 * 60 * 1000);
    const ids = await db.forOrg(organizationId, async (tx) => {
      const old = await aSheet(tx, {
        connectedBy: userId,
        status: "connecting",
        step: "columns",
        connectedAt: null,
        touchedAt: stale,
      });
      await aSheetColumn(tx, { connectionId: old.id, header: "Name" });
      await aSheetRow(tx, { connectionId: old.id });
      const young = await aSheet(tx, {
        connectedBy: userId,
        status: "connecting",
        step: "tab",
        connectedAt: null,
        touchedAt: fresh,
      });
      const connected = await aSheet(tx, { connectedBy: userId, status: "running", touchedAt: stale });
      return { old: old.id, young: young.id, connected: connected.id };
    });
    const swept = await run();
    expect(swept.draftsDeleted).toBe(1);
    const left = await platform.sheetConnection.findMany({ where: { organizationId }, select: { id: true } });
    expect(left.map((sheet) => sheet.id).sort()).toEqual([ids.young, ids.connected].sort());
    expect(await platform.sheetColumn.count({ where: { connectionId: ids.old } })).toBe(0);
    expect(await platform.sheetRow.count({ where: { connectionId: ids.old } })).toBe(0);
  });

  it("leaves a connected sheet that waits for a new tab's baseline alone, however long, and still sweeps a draft that never ran", async () => {
    const ids = await db.forOrg(organizationId, async (tx) => {
      const waiting = await aSheet(tx, {
        connectedBy: userId,
        status: "connecting",
        connectedAt: new Date(now.getTime() - 20 * DAY),
        touchedAt: new Date(now.getTime() - 3 * DAY),
      });
      const draft = await aSheet(tx, {
        connectedBy: userId,
        status: "connecting",
        step: "columns",
        connectedAt: null,
        touchedAt: new Date(now.getTime() - 3 * DAY),
      });
      return { waiting: waiting.id, draft: draft.id };
    });
    await run();
    const left = await platform.sheetConnection.findMany({ where: { id: { in: [ids.waiting, ids.draft] } } });
    expect(left.map((sheet) => sheet.id)).toEqual([ids.waiting]);
  });

  it("never drops a problem the agency hid: it stays until its row leaves the sheet", async () => {
    const sheetId = await db.forOrg(organizationId, async (tx) => {
      const sheet = await aSheet(tx, { connectedBy: userId });
      await aSheetRow(tx, {
        connectionId: sheet.id,
        status: "not_added",
        cells: ["hidden long ago"],
        resolvedAt: new Date(now.getTime() - 30 * DAY),
      });
      await aSheetRow(tx, { connectionId: sheet.id, status: "not_added", cells: ["unresolved"] });
      return sheet.id;
    });
    await run();
    expect(await platform.sheetRow.count({ where: { connectionId: sheetId } })).toBe(2);
  });

  it("drops schedule rows with no live connection and claims with none, only after an hour", async () => {
    const live = await db.forOrg(organizationId, (tx) => aSheet(tx, { connectedBy: userId, status: "running" }));
    const paused = await db.forOrg(organizationId, (tx) => aSheet(tx, { connectedBy: userId, status: "paused" }));
    const stray = randomUUID();
    for (const sheetId of [live.id, paused.id, stray]) {
      await upsertScheduleRow(db, { sheetId, organizationId, serviceAccountIndex: 0, nextCheckAt: now });
    }
    // A claim held by a live connection, one nobody holds that is fresh, and one nobody holds that is old.
    const held = await takeSpreadsheetClaim(
      db,
      organizationId,
      hashes.spreadsheetHash(aSpreadsheetId()),
      new Date(now.getTime() - 2 * 60 * 60 * 1000),
    );
    await db.forOrg(organizationId, (tx) =>
      tx.sheetConnection.update({ where: { id: live.id }, data: { claimId: held.claimId } }),
    );
    const fresh = await takeSpreadsheetClaim(
      db,
      organizationId,
      hashes.spreadsheetHash(aSpreadsheetId()),
      new Date(now.getTime() - 10 * 60 * 1000),
    );
    const old = await takeSpreadsheetClaim(
      db,
      organizationId,
      hashes.spreadsheetHash(aSpreadsheetId()),
      new Date(now.getTime() - 2 * 60 * 60 * 1000),
    );
    const swept = await run();
    expect(swept.scheduleRowsDropped).toBeGreaterThanOrEqual(2);
    expect(await scheduleRowOf(db, live.id)).not.toBeNull();
    expect(await scheduleRowOf(db, paused.id)).toBeNull();
    expect(await scheduleRowOf(db, stray)).toBeNull();
    const claims = (await platform.sheetSpreadsheetClaim.findMany({ select: { id: true } })).map((claim) => claim.id);
    expect(claims).toEqual(expect.arrayContaining([held.claimId, fresh.claimId]));
    expect(claims).not.toContain(old.claimId);
    expect(swept.claimsDropped).toBeGreaterThanOrEqual(1);
  });

  it("registers platform.sweep-sheets with the console's schedules, hourly, and runs in pages", async () => {
    const services = { platformDb } as unknown as PlatformServices;
    expect(sheetsSweepSchedule(services)).toMatchObject({
      queue: SWEEP_SHEETS_QUEUE,
      cron: "41 * * * *",
      timeZone: "Asia/Kolkata",
    });
    expect(SWEEP_SHEETS_QUEUE).toBe("platform.sweep-sheets");
    // 230 stale drafts are cleared by more than one page.
    const stale = new Date(Date.now() - 3 * DAY);
    await db.forOrg(organizationId, async (tx) => {
      await tx.sheetConnection.createMany({
        data: Array.from({ length: 230 }, () => ({
          spreadsheetId: aSpreadsheetId(),
          tabGid: "0",
          tabTitle: "Form responses 1",
          sheetTitle: "Draft",
          sheetLocale: "en_IN",
          sheetTimeZone: "Asia/Kolkata",
          serviceAccountIndex: 0,
          connectedBy: userId,
          status: "connecting",
          touchedAt: stale,
        })),
      });
    });
    const total = await sweepSheetsNow(services, new Date());
    expect(total.draftsDeleted).toBeGreaterThanOrEqual(230);
    expect(
      await platform.sheetConnection.count({
        where: { organizationId, status: "connecting", touchedAt: { lt: new Date(Date.now() - DAY) } },
      }),
    ).toBe(0);
  });

  it("refuses to sweep inside an organization, whose view of the other tables would make it delete what is others'", async () => {
    await expect(db.forOrg(organizationId, (tx) => dropStaleScheduleRows(tx))).rejects.toThrow(
      "outside any organization",
    );
    await expect(db.forOrg(organizationId, (tx) => dropUnusedClaims(tx, now))).rejects.toThrow(
      "outside any organization",
    );
    await expect(db.forOrg(organizationId, (tx) => sweepSheets(tx, now, 10))).rejects.toThrow(
      "outside any organization",
    );
  });
});
