// The controls (S38, S41, S42, S44): Sync now is refused while a check runs or within 30 seconds of one, and asks for a
// full read; pause and resume keep the cursor; disconnect forgets the ledger, keeps the counters in the audit entry and
// lets the claim go unless another tab holds it; connecting again asks again; Check again tries at once.
import { afterAll, describe, expect, it } from "vitest";
import { takeSpreadsheetClaim } from "../../src/sheets/index.js";
import {
  baselineListener,
  beginSheet,
  disconnectSheet,
  pauseSheet,
  recheckSheet,
  requestSyncNow,
  resumeSheet,
} from "../../src/sheets/index.js";
import { publishEvent } from "../../src/jobs/index.js";
import { answer, setup as setupSheet } from "./support/running.js";
import {
  anAgency,
  auditOf,
  createTestSheets,
  eventsOf,
  jobDependencies,
  memberOf,
  runListener,
} from "./support/sheets.js";
import { freshPhone } from "../crm/support/records.js";

const test = createTestSheets();
afterAll(() => test.close());
const setup = () => setupSheet(test);
const now = new Date();
/** A minute on: the earlier requests of a test are no longer within half a minute. */
const later = new Date(Date.now() + 60_000);

describe("Sync now", () => {
  it("refuses Sync now within 30 seconds of the last check or while one runs, with SHEET_BUSY", async () => {
    const button = await setupSheet(test);
    await button.check();
    const justChecked = await button.state();
    expect(justChecked.lastCheckedAt).not.toBeNull();
    await expect(button.inOrg((tx) => requestSyncNow(tx, button.sheet.sheetId, new Date()))).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "SHEET_BUSY",
    });
    // A check that is running holds it too.
    const later = new Date(Date.now() + 60_000);
    await button.inOrg((tx) =>
      tx.sheetConnection.update({ where: { id: button.sheet.sheetId }, data: { checkStartedAt: later } }),
    );
    await expect(button.inOrg((tx) => requestSyncNow(tx, button.sheet.sheetId, later))).rejects.toMatchObject({
      reason: "SHEET_BUSY",
    });
  });

  it("publishes sheet.sync-requested once for a Sync now (mode sync-now), and a second press at once is refused", async () => {
    const button = await setup();
    await button.inOrg((tx) =>
      tx.sheetConnection.update({
        where: { id: button.sheet.sheetId },
        data: { lastCheckedAt: new Date(Date.now() - 10 * 60_000) },
      }),
    );
    const quiet = new Date();
    await button.inOrg((tx) => requestSyncNow(tx, button.sheet.sheetId, quiet));
    expect(await eventsOf(test, button.agency, ["sheet.sync-requested"])).toEqual([
      ["sheet.sync-requested", { sheetId: button.sheet.sheetId, mode: "sync-now" }],
    ]);
    await expect(button.inOrg((tx) => requestSyncNow(tx, button.sheet.sheetId, quiet))).rejects.toMatchObject({
      reason: "SHEET_BUSY",
    });
  });

  it("refuses a paused sheet and one that needs its own action", async () => {
    const paused = await setup();
    await paused.inOrg((tx) => pauseSheet(tx, memberOf(paused.agency), paused.sheet.sheetId));
    await expect(
      paused.inOrg((tx) => requestSyncNow(tx, paused.sheet.sheetId, new Date(Date.now() + 600_000))),
    ).rejects.toMatchObject({ reason: "SHEET_NOT_READY" });
  });
});

describe("pause and resume", () => {
  it("pauses and resumes from the cursor, so rows added meanwhile are added on resume", async () => {
    const pausing = await setup();
    const manager = memberOf(pausing.agency);
    pausing.append(answer("First", freshPhone(), 1));
    await pausing.check();
    const cursor = (await pausing.state()).cursorRow;
    await pausing.inOrg((tx) => pauseSheet(tx, manager, pausing.sheet.sheetId));
    expect((await pausing.state()).status).toBe("paused");
    pausing.append(answer("While Paused", freshPhone(), 2));
    expect(await pausing.check()).toMatchObject({ result: "skipped", keepSchedule: false });
    expect((await pausing.state()).cursorRow).toBe(cursor);
    expect(await pausing.leads()).toHaveLength(1);
    // Pausing again changes nothing.
    await pausing.inOrg((tx) => pauseSheet(tx, manager, pausing.sheet.sheetId));
    await pausing.inOrg((tx) => resumeSheet(tx, manager, pausing.sheet.sheetId));
    expect((await pausing.state()).status).toBe("running");
    await pausing.check();
    expect((await pausing.leads()).map((lead) => lead.person.name).sort()).toEqual(["First", "While Paused"]);
    expect((await auditOf(test, pausing.agency, pausing.sheet.sheetId)).map((entry) => entry.action)).toEqual([
      "sheet.paused",
      "sheet.resumed",
    ]);
    expect(await eventsOf(test, pausing.agency, ["sheet.schedule-changed"])).toHaveLength(3);
    await expect(pausing.inOrg((tx) => resumeSheet(tx, manager, pausing.sheet.sheetId))).rejects.toMatchObject({
      reason: "SHEET_NOT_READY",
    });
  });
});

describe("disconnect", () => {
  it("deletes the ledger, columns and value matches, keeps the counters in the audit entry, and releases the claim unless another tab holds it", async () => {
    const agency = await anAgency(test);
    const manager = memberOf(agency);
    const spreadsheetId = (await import("./support/sheets.js")).aSpreadsheetId();
    (await import("./support/sheets.js")).aGoogleSheet(test, {
      id: spreadsheetId,
      rows: [["Full name", "Phone number"]],
      more: [{ gid: "5", title: "Tab two", rows: [["Name", "Phone"]] }],
    });
    const first = await beginSheet(test.db, test.dependencies, manager, { spreadsheetId, gid: null }, now);
    const second = await beginSheet(test.db, test.dependencies, manager, { spreadsheetId, gid: "5" }, now);
    // Both tabs hold the one claim; disconnecting one keeps it.
    await disconnectSheet(test.db, manager, first.sheetId, now);
    const stranger = await anAgency(test, "Stranger");
    await expect(
      takeSpreadsheetClaim(test.db, stranger, test.hashes.spreadsheetHash(spreadsheetId), now),
    ).rejects.toMatchObject({ reason: "SHEET_CLAIMED_ELSEWHERE" });
    await disconnectSheet(test.db, manager, second.sheetId, now);
    await expect(
      takeSpreadsheetClaim(test.db, stranger, test.hashes.spreadsheetHash(spreadsheetId), now),
    ).resolves.toMatchObject({ created: true });
  });

  it("forgets what it read, keeps the counters, and asks again when connected again, adding nothing twice", async () => {
    const leaving = await setup();
    const manager = memberOf(leaving.agency);
    leaving.append(answer("Asha", freshPhone(), 1));
    leaving.append(answer("Ravi", freshPhone(), 2));
    await leaving.check();
    await leaving.inOrg((tx) =>
      tx.sheetValueMatch.create({
        data: { connectionId: leaving.sheet.sheetId, field: "owner", value: "Ashu", matchedBy: "chosen" },
      }),
    );
    await disconnectSheet(test.db, manager, leaving.sheet.sheetId, now);
    const stored = await leaving.inOrg<{ status: string; rowsAdded: number; disconnectedAt: Date | null }>((tx) =>
      tx.sheetConnection.findUniqueOrThrow({ where: { id: leaving.sheet.sheetId } }),
    );
    expect(stored).toMatchObject({ status: "disconnected", rowsAdded: 2 });
    expect(stored.disconnectedAt).not.toBeNull();
    expect(
      await leaving.inOrg<number[]>(async (tx) => [
        await tx.sheetRow.count(),
        await tx.sheetColumn.count(),
        await tx.sheetValueMatch.count(),
      ]),
    ).toEqual([0, 0, 0]);
    const entry = (await auditOf(test, leaving.agency, leaving.sheet.sheetId)).find(
      (e) => e.action === "sheet.disconnected",
    );
    expect(entry?.after).toEqual({ status: "disconnected", rowsAdded: 2, rowsMerged: 0, rowsDuplicate: 0 });
    expect(JSON.stringify(entry)).not.toContain("Goa Diwali");
    // It is gone: not found, not checked.
    await expect(leaving.inOrg((tx) => requestSyncNow(tx, leaving.sheet.sheetId, new Date()))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await leaving.check()).toMatchObject({ result: "skipped", keepSchedule: false });
    // Connected again, the rows already there are asked about again, and adding them again is left to the person's choice:
    // the sheet's two people are people already, so a second sheet connection finds them in the CRM and adds nothing twice.
    const again = await beginSheet(
      test.db,
      test.dependencies,
      manager,
      { spreadsheetId: leaving.sheet.spreadsheetId, gid: null },
      now,
    );
    expect(again.sheetId).not.toBe(leaving.sheet.sheetId);
    expect(await leaving.leads()).toHaveLength(2);
  });

  it("opens Disconnect while the agency is read-only: it only reduces what happens", async () => {
    const readOnly = await setup();
    // The control takes no entitlements: only the procedure asks the lifecycle, and marks it always.
    await disconnectSheet(test.db, memberOf(readOnly.agency), readOnly.sheet.sheetId, now);
    expect((await readOnly.state()).status).toBe("disconnected");
  });
});

describe("Check again", () => {
  it("rechecks a lost sheet at once and a sheet with a missing tab on a chosen tab, keeping rows seen", async () => {
    const lost = await setup();
    const manager = memberOf(lost.agency);
    lost.append(answer("Asha", freshPhone(), 1));
    await lost.check();
    test.google.failNext("not_shared");
    await lost.check("sync-now");
    expect((await lost.state()).status).toBe("lost_access");
    await recheckSheet(test.db, test.dependencies, manager, { sheetId: lost.sheet.sheetId }, now);
    expect(await eventsOf(test, lost.agency, ["sheet.sync-requested"])).toEqual([
      ["sheet.sync-requested", { sheetId: lost.sheet.sheetId, mode: "recheck" }],
    ]);
    await lost.check("recheck");
    expect((await lost.state()).status).toBe("running");

    // The tab is gone: choose another; the rows seen stay known.
    const id = lost.sheet.spreadsheetId;
    test.google.deleteSpreadsheet(id);
    test.google.addSpreadsheet({
      id,
      title: "Goa Diwali campaign (Responses)",
      tabs: [
        {
          gid: "9",
          title: "Renamed answers",
          rows: [["Timestamp", "Full name", "Phone number", "Email Address"], answer("Asha", "+919876500009", 1)],
        },
      ],
    });
    test.google.share(id, test.accountEmail);
    await lost.check("sync-now");
    expect((await lost.state()).status).toBe("tab_missing");
    await expect(
      recheckSheet(test.db, test.dependencies, manager, { sheetId: lost.sheet.sheetId, tabGid: "404" }, later),
    ).rejects.toMatchObject({ reason: "SHEET_NOT_READY" });
    await recheckSheet(test.db, test.dependencies, manager, { sheetId: lost.sheet.sheetId, tabGid: "9" }, later);
    expect(await lost.state()).toMatchObject({ tabGid: "9", tabTitle: "Renamed answers", status: "connecting" });
    // The chosen tab is baselined as at connect (its rows are never added); then the sheet runs on it.
    await runListener(test, baselineListener(jobDependencies(test, lost.identity)), lost.agency, {
      type: "sheet.baseline-requested",
      payload: { sheetId: lost.sheet.sheetId },
    });
    expect((await lost.state()).status).toBe("running");
    await lost.check("recheck");
    expect(await lost.leads()).toHaveLength(1);
  });

  it("brings none of another tab's rows in as leads: they are baselined, and only a row added after is a lead", async () => {
    const running = await setup();
    const manager = memberOf(running.agency);
    const id = running.sheet.spreadsheetId;
    const old = [1, 2, 3].map((index) => answer(`Old ${String(index)}`, freshPhone(), index));
    test.google.deleteSpreadsheet(id);
    test.google.addSpreadsheet({
      id,
      title: "Goa Diwali campaign (Responses)",
      tabs: [
        { gid: "9", title: "Archive", rows: [["Timestamp", "Full name", "Phone number", "Email Address"], ...old] },
      ],
    });
    test.google.share(id, test.accountEmail);
    await running.check("sync-now");
    expect((await running.state()).status).toBe("tab_missing");
    await recheckSheet(test.db, test.dependencies, manager, { sheetId: running.sheet.sheetId, tabGid: "9" }, later);
    await runListener(test, baselineListener(jobDependencies(test, running.identity)), running.agency, {
      type: "sheet.baseline-requested",
      payload: { sheetId: running.sheet.sheetId },
    });
    await running.check("sync-now");
    expect(await running.leads()).toHaveLength(0);
    expect((await running.ledger()).map((row) => row.status)).toEqual([
      "before_connect",
      "before_connect",
      "before_connect",
    ]);
    test.google.append(id, "Archive", answer("Fresh", freshPhone(), 9));
    await running.check("sync-now");
    expect((await running.leads()).map((lead) => lead.person.name)).toEqual(["Fresh"]);
  });

  it("refuses Check again twice within half a minute, and while a check runs, with SHEET_BUSY, as Sync now is", async () => {
    const lost = await setup();
    const manager = memberOf(lost.agency);
    await lost.inOrg((tx) =>
      tx.sheetConnection.update({ where: { id: lost.sheet.sheetId }, data: { status: "lost_access" } }),
    );
    // The Sync now that lost it a moment ago does not count: it is another request, not this one pressed twice.
    await lost.inOrg((tx) =>
      publishEvent(tx, { type: "sheet.sync-requested", payload: { sheetId: lost.sheet.sheetId, mode: "sync-now" } }),
    );
    await recheckSheet(test.db, test.dependencies, manager, { sheetId: lost.sheet.sheetId }, new Date());
    await expect(
      recheckSheet(test.db, test.dependencies, manager, { sheetId: lost.sheet.sheetId }, new Date()),
    ).rejects.toMatchObject({ reason: "SHEET_BUSY" });
    // A check running holds it too, however long ago a request went out.
    await lost.inOrg((tx) =>
      tx.sheetConnection.update({ where: { id: lost.sheet.sheetId }, data: { checkStartedAt: new Date() } }),
    );
    await expect(
      recheckSheet(test.db, test.dependencies, manager, { sheetId: lost.sheet.sheetId }, later),
    ).rejects.toMatchObject({ reason: "SHEET_BUSY" });
  });

  it("lets a connected sheet that waits for a new tab's baseline ask for it again", async () => {
    const running = await setup();
    const manager = memberOf(running.agency);
    const id = running.sheet.spreadsheetId;
    test.google.deleteSpreadsheet(id);
    test.google.addSpreadsheet({
      id,
      title: "Goa Diwali campaign (Responses)",
      tabs: [
        {
          gid: "9",
          title: "Archive",
          rows: [["Timestamp", "Full name", "Phone number", "Email Address"], answer("Old", freshPhone(), 1)],
        },
      ],
    });
    test.google.share(id, test.accountEmail);
    await running.check("sync-now");
    await recheckSheet(test.db, test.dependencies, manager, { sheetId: running.sheet.sheetId, tabGid: "9" }, later);
    // The baseline did not finish: the sheet waits in connecting, connected before.
    expect(await running.state()).toMatchObject({ status: "connecting", lastFullReadAt: null });
    expect((await running.state()).connectedAt).not.toBeNull();
    // Check again asks for the baseline once more.
    const events = await eventsOf(test, running.agency, ["sheet.baseline-requested"]);
    await recheckSheet(
      test.db,
      test.dependencies,
      manager,
      { sheetId: running.sheet.sheetId },
      new Date(Date.now() + 120_000),
    );
    expect(await eventsOf(test, running.agency, ["sheet.baseline-requested"])).toHaveLength(events.length + 1);
  });

  it("asks for the baseline again for a sheet that never got one", async () => {
    const never = await setup();
    await never.inOrg((tx) =>
      tx.sheetConnection.update({
        where: { id: never.sheet.sheetId },
        data: { status: "lost_access", connectedAt: null },
      }),
    );
    await recheckSheet(test.db, test.dependencies, memberOf(never.agency), { sheetId: never.sheet.sheetId }, now);
    expect(await never.state()).toMatchObject({ status: "connecting", step: "done" });
    expect(await eventsOf(test, never.agency, ["sheet.baseline-requested"])).toHaveLength(1);
  });

  it("refuses a sheet that has nothing to check again", async () => {
    const fine = await setup();
    await expect(
      recheckSheet(test.db, test.dependencies, memberOf(fine.agency), { sheetId: fine.sheet.sheetId }, now),
    ).rejects.toMatchObject({ reason: "SHEET_NOT_READY" });
  });
});
