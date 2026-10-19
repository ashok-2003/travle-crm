// Attention states (S39, S45, S34): the Owner is told once for a change into one, even when another connected the sheet,
// told again only after the sheet recovers and fails again; recovery is recorded and told to nobody; the other states
// notify the same way; a connector who can no longer manage lead sources makes the sheet need a manager, once.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { attentionListener } from "../../src/sheets/index.js";
import { fakeIdentity } from "../imports/support/test-imports.js";
import { setup as setupSheet } from "./support/running.js";
import { auditOf, createTestSheets, jobDependencies } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());
const later = (minutes: number) => () => new Date(Date.now() + minutes * 60_000);

/** The notices of this sheet the Owner has, after the listener has seen each attention event. */
async function tellOwner(setup: Awaited<ReturnType<typeof setupSheet>>, owner: string, connector?: string) {
  const events = await setup.inOrg<{ id: string; payload: unknown }[]>((tx) =>
    tx.outboxEvent.findMany({ where: { type: "sheet.attention" }, orderBy: { id: "asc" } }),
  );
  const identity = {
    ...fakeIdentity({ firstOwner: owner }),
    memberContacts: () =>
      Promise.resolve(
        connector === undefined ? [] : [{ userId: connector, name: "Asha Sharma", email: "asha@example.test" }],
      ),
  };
  const listener = attentionListener(jobDependencies(test, identity));
  for (const event of events) {
    await listener.handle(
      {
        id: event.id,
        organizationId: setup.agency,
        type: "sheet.attention",
        payload: event.payload as never,
        occurredAt: new Date(),
      },
      {
        actor: { organizationId: setup.agency, userId: null, source: "job", impersonatedBy: null },
        forOrg: (work) => test.db.forOrg(setup.agency, work),
      },
    );
  }
  return setup.inOrg<{ recipientUserId: string; title: string; body: string; link: string | null; kind: string }[]>(
    (tx) => tx.notification.findMany({ where: { kind: "sheet.needs-attention" }, orderBy: { id: "asc" } }),
  );
}

describe("entering an attention state", () => {
  it("tells the Owner once however many checks fail, and again after the sheet recovers and fails again", async () => {
    const lost = await setupSheet(test);
    const owner = randomUUID();
    for (const minutes of [10, 20, 30, 40, 50, 60, 70]) {
      test.google.failNext("not_shared");
      await lost.check("scheduled", {}, later(minutes));
    }
    expect(await tellOwner(lost, owner)).toHaveLength(1);
    // Shared again: running, with an entry and no notice.
    await lost.check("scheduled", {}, later(80));
    expect(await lost.state()).toMatchObject({ status: "running", consecutiveFailures: 0, attentionSince: null });
    expect((await auditOf(test, lost.agency, lost.sheet.sheetId)).map((entry) => entry.action)).toEqual([
      "sheet.access-lost",
      "sheet.access-restored",
    ]);
    expect(await tellOwner(lost, owner)).toHaveLength(1);
    // And lost again: told again.
    for (const minutes of [90, 100, 110]) {
      test.google.failNext("not_shared");
      await lost.check("scheduled", {}, later(minutes));
    }
    const notices = await tellOwner(lost, owner);
    expect(notices).toHaveLength(2);
    expect(notices[0]).toMatchObject({
      recipientUserId: owner,
      kind: "sheet.needs-attention",
      title: "We can't open your sheet 'Goa Diwali campaign (Responses)'",
      body: `Share it with ${test.accountEmail} again.`,
      link: `/settings/lead-sources/sheets/${lost.sheet.sheetId}`,
    });
    // Running the listener again for the same events adds nothing.
    expect(await tellOwner(lost, owner)).toHaveLength(2);
  });

  it("tells the Owner even when someone else connected the sheet, and the connector who is the Owner once", async () => {
    const other = await setupSheet(test);
    test.google.failNext("not_shared");
    await other.check("sync-now");
    const owner = randomUUID();
    const notices = await tellOwner(other, owner);
    expect(notices.map((notice) => notice.recipientUserId)).toEqual([owner]);

    const same = await setupSheet(test);
    test.google.failNext("not_shared");
    await same.check("sync-now");
    expect((await tellOwner(same, same.importer.userId)).map((notice) => notice.recipientUserId)).toEqual([
      same.importer.userId,
    ]);
  });

  it("tells nobody when the sheet left the state before the listener ran", async () => {
    const quick = await setupSheet(test);
    test.google.failNext("not_shared");
    await quick.check("sync-now");
    await quick.check("sync-now");
    expect((await quick.state()).status).toBe("running");
    expect(await tellOwner(quick, randomUUID())).toHaveLength(0);
  });

  it("enters columns_missing the same way, naming the sheet and what to do", async () => {
    const gap = await setupSheet(test, {
      rows: [["Full name", "Phone number"]],
      fields: { fullname: "name", phonenumber: "phone" },
    });
    test.google.editCell(gap.sheet.spreadsheetId, "Form responses 1", 1, 1, "Mobile");
    await gap.check();
    expect((await gap.state()).status).toBe("columns_missing");
    const [notice] = await tellOwner(gap, randomUUID());
    expect(notice).toMatchObject({ title: "Columns are missing from 'Goa Diwali campaign (Responses)'" });
    expect((await auditOf(test, gap.agency, gap.sheet.sheetId)).map((entry) => entry.action)).toEqual([
      "sheet.columns-missing",
    ]);
  });

  it("enters needs_manager when the connector is no longer a member or lost leads:create or leads:assign, once", async () => {
    const gone = await setupSheet(test);
    gone.append(["19/10/2026 14:00:00", "Waiting Person", "+919876500001", ""]);
    const departed = { ...gone.identity, resolveAccess: () => Promise.resolve(null) };
    expect(await gone.check("scheduled", { identity: departed })).toMatchObject({
      result: "skipped",
      keepSchedule: true,
    });
    expect((await gone.state()).status).toBe("needs_manager");
    expect(await gone.leads()).toHaveLength(0);
    expect(await gone.check("scheduled", { identity: departed }, later(10))).toMatchObject({ result: "skipped" });
    expect(await gone.inOrg<number>((tx) => tx.outboxEvent.count({ where: { type: "sheet.attention" } }))).toBe(1);
    const [notice] = await tellOwner(gone, randomUUID(), gone.importer.userId);
    expect(notice?.title).toBe("Asha Sharma can't manage lead sources any more");

    // A role that lost the permissions is the same.
    const demoted = await setupSheet(test);
    const noPermissions = {
      ...demoted.identity,
      resolveAccess: () =>
        Promise.resolve({ ...demoted.importer, permissions: { missing: () => ["leads:assign"] } as never }),
    };
    await demoted.check("scheduled", { identity: noPermissions });
    expect((await demoted.state()).status).toBe("needs_manager");
  });
});
