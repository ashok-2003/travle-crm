// The staff import's passwords and its add (B45-B47, D24): only hashes reach the rows; the add checks every row again
// as it is now, then writes every account in one transaction or none; a row that fails, too few seats or a lost
// permission end the add without a half-added team.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImportedStaffRowError } from "../../../src/identity/index.js";
import { addStaffImportListener, requestStaffImportAdd, setStaffImportPasswords } from "../../../src/imports/index.js";
import { addStaffMember, canSignInByUsername, memberAccessOf } from "../../identity/test-identity.js";
import { listenerContext } from "../support/test-imports.js";
import {
  checkedStaffImport,
  createStaffWorld,
  dependenciesOn,
  identityOn,
  readImport,
  standardFile as standard,
  stepEvent,
  type Cell,
  type StaffWorld,
} from "./support.js";

describe("the staff import's passwords and add", () => {
  let world: StaffWorld;
  let code: string;
  let made = 0;

  /** A good file's row: a username no earlier test used, and its password. */
  const person = (name: string, role: Cell = "Sales"): { row: Cell[]; username: string } => {
    made += 1;
    const username = `staff-${String(made)}-${code}`;
    return { row: [name, username, null, null, role], username };
  };
  const passwordOf = (rowNumber: number) => `Temp-pass-${String(rowNumber)}-x`;

  /** The file checked, with a password sent for each of its rows to add. */
  async function withPasswords(rows: Cell[][], sentFor?: number[]) {
    const checked = await checkedStaffImport(world, { ...standard, rows });
    const toAdd = checked.rows.filter((row) => row.plan === "new").map((row) => row.rowNumber);
    await setStaffImportPasswords(world.test.db, world.identity, world.admin, {
      importId: checked.id,
      passwords: (sentFor ?? toAdd).map((rowNumber) => ({ rowNumber, password: passwordOf(rowNumber) })),
    });
    return checked;
  }
  const add = async (id: string, identity = world.identity) => {
    await requestStaffImportAdd(world.test.db, identity, world.admin, id, new Date());
    await run(id, identity);
  };
  const run = (id: string, identity = world.identity) =>
    addStaffImportListener(dependenciesOn(world, identity)).handle(
      stepEvent(world, "import.add-requested", id),
      listenerContext(world.test, world.agency.organizationId),
    );
  const staffCount = async () => (await world.identity.staff.list(world.owner)).length;

  beforeAll(async () => {
    world = await createStaffWorld();
    code = world.agency.code.toLowerCase();
  });

  afterAll(async () => {
    await world.close();
  });

  it("keeps only each password's hash on its row, never for a row not to be added", async () => {
    const one = person("One");
    const two = person("Two");
    const checked = await checkedStaffImport(world, {
      ...standard,
      rows: [one.row, two.row, [null, "no.name", null, null, "Sales"]],
    });
    await setStaffImportPasswords(world.test.db, world.identity, world.admin, {
      importId: checked.id,
      passwords: [2, 3, 4].map((rowNumber) => ({ rowNumber, password: passwordOf(rowNumber) })),
    });
    const { rows } = await readImport(world, checked.id);
    expect(rows.map((row) => row.passwordHash !== null)).toEqual([true, true, false]);
    for (const row of rows) expect(row.passwordHash ?? "").not.toContain("Temp-pass");
  });

  it("takes a batch of passwords sent again in place of the first", async () => {
    const one = person("One");
    const checked = await checkedStaffImport(world, { ...standard, rows: [one.row] });
    const send = (password: string) =>
      setStaffImportPasswords(world.test.db, world.identity, world.admin, {
        importId: checked.id,
        passwords: [{ rowNumber: 2, password }],
      });
    await send("First-pass-111");
    const first = (await readImport(world, checked.id)).rows[0]?.passwordHash;
    await send("Second-pass-222");
    expect((await readImport(world, checked.id)).rows[0]?.passwordHash).not.toBe(first);
    await add(checked.id);
    expect(await canSignInByUsername(world.identity, world.agency.code, one.username, "Second-pass-222")).toBe(true);
    expect(await canSignInByUsername(world.identity, world.agency.code, one.username, "First-pass-111")).toBe(false);
  });

  it("refuses passwords for an import that isn't at its preview, and Add until every row has its password", async () => {
    const checked = await checkedStaffImport(world, { ...standard, rows: [person("One").row, person("Two").row] });
    await expect(
      requestStaffImportAdd(world.test.db, world.identity, world.admin, checked.id, new Date()),
    ).rejects.toMatchObject({ reason: "IMPORT_NOT_READY" });
    await setStaffImportPasswords(world.test.db, world.identity, world.admin, {
      importId: checked.id,
      passwords: [{ rowNumber: 2, password: passwordOf(2) }],
    });
    await expect(
      requestStaffImportAdd(world.test.db, world.identity, world.admin, checked.id, new Date()),
    ).rejects.toMatchObject({ reason: "IMPORT_NOT_READY" });
    await world.test.db.forOrg(world.agency.organizationId, (tx) =>
      tx.importBatch.update({ where: { id: checked.id }, data: { status: "done" } }),
    );
    await expect(
      setStaffImportPasswords(world.test.db, world.identity, world.admin, {
        importId: checked.id,
        passwords: [{ rowNumber: 3, password: passwordOf(3) }],
      }),
    ).rejects.toMatchObject({ reason: "IMPORT_NOT_READY" });
  });

  it("adds every ready row in one transaction, each with a temporary password to change, each row linked to its member", async () => {
    const one = person("One");
    const two = person("Two", "Operations");
    const checked = await withPasswords([one.row, two.row, [null, "no.name", null, null, "Sales"]]);
    const before = await staffCount();
    await add(checked.id);
    const { batch, rows } = await readImport(world, checked.id);
    expect(batch).toMatchObject({ status: "done", rowsAdded: 2, failureReason: null });
    expect(rows.map((row) => [row.outcome, row.memberId !== null, row.passwordHash])).toEqual([
      ["added", true, null],
      ["added", true, null],
      ["not_added", false, null],
    ]);
    expect(await staffCount()).toBe(before + 2);
    const staff = await world.identity.staff.list(world.owner);
    expect(staff.find((member) => member.memberId === rows[1]?.memberId)).toMatchObject({
      username: two.username,
      mustChangePassword: true,
      role: { key: "operations" },
    });
    expect(await canSignInByUsername(world.identity, world.agency.code, one.username, passwordOf(2))).toBe(true);
  });

  it("records staff.created with the import's id, and import.finished, and notifies nobody", async () => {
    const one = person("One");
    const checked = await withPasswords([one.row]);
    await add(checked.id);
    const { rows } = await readImport(world, checked.id);
    const created = await world.platform.auditEntry.findMany({
      where: { entityId: rows[0]?.memberId ?? "", action: "staff.created" },
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ actorUserId: world.admin.userId, after: { importId: checked.id } });
    const entries = await world.platform.auditEntry.findMany({ where: { entityId: checked.id } });
    expect(entries.map((entry) => entry.action)).toEqual(expect.arrayContaining(["import.started", "import.finished"]));
    const notices = await world.platform.notification.count({
      where: { organizationId: world.agency.organizationId, recipientUserId: world.admin.userId },
    });
    expect(notices).toBe(0);
    expect(JSON.stringify(entries) + JSON.stringify(created)).not.toContain("Temp-pass");
  });

  it("returns the import to the preview when a row fails now, its row marked, every hash cleared", async () => {
    const one = person("One");
    const two = person("Two");
    const checked = await withPasswords([one.row, two.row]);
    // Meanwhile, someone adds the second person by hand.
    await addStaffMember(world.identity, world.owner, two.username, "sales");
    const before = await staffCount();
    await add(checked.id);
    const after = await readImport(world, checked.id);
    expect(after.batch).toMatchObject({ status: "checked", failureReason: "row_changed", rowsToAdd: 1, rowsDone: 0 });
    expect(after.rows.map((row) => [row.plan, row.reasons, row.outcome, row.passwordHash])).toEqual([
      ["new", [], null, null],
      ["not_added", ["already_on_staff"], null, null],
    ]);
    expect(await staffCount()).toBe(before);
    // Pressing Add again with new passwords adds the one left.
    await setStaffImportPasswords(world.test.db, world.identity, world.admin, {
      importId: checked.id,
      passwords: [{ rowNumber: 2, password: passwordOf(2) }],
    });
    expect((await readImport(world, checked.id)).batch.failureReason).toBeNull();
    await add(checked.id);
    expect((await readImport(world, checked.id)).batch).toMatchObject({ status: "done", rowsAdded: 1 });
  });

  it("marks the row an identity transaction refused, and adds nobody", async () => {
    const checked = await withPasswords([person("One").row, person("Two").row]);
    const refusing = {
      ...world.identity,
      staff: {
        ...world.identity.staff,
        addImported: () => Promise.reject(new ImportedStaffRowError(3, "taken_meanwhile")),
      },
    };
    await add(checked.id, refusing);
    const after = await readImport(world, checked.id);
    expect(after.batch).toMatchObject({ status: "checked", failureReason: "row_changed", rowsToAdd: 1 });
    expect(after.byRow(3)).toMatchObject({ plan: "not_added", reasons: ["taken_meanwhile"], passwordHash: null });
    expect(after.byRow(2)).toMatchObject({ plan: "new", passwordHash: null });
  });

  it("refuses the whole file past the seats: IMPORT_OVER_SEAT_LIMIT, up front and again under the lock", async () => {
    const checked = await withPasswords([person("One").row, person("Two").row]);
    const members = await staffCount();
    await expect(
      requestStaffImportAdd(world.test.db, identityOn(members + 1), world.admin, checked.id, new Date()),
    ).rejects.toMatchObject({ reason: "IMPORT_OVER_SEAT_LIMIT" });
    // The seats go between Add and the job.
    const tight = identityOn(members + 1);
    await requestStaffImportAdd(world.test.db, world.identity, world.admin, checked.id, new Date());
    await run(checked.id, tight);
    const after = await readImport(world, checked.id);
    expect(after.batch).toMatchObject({ status: "checked", failureReason: "over_seat_limit", rowsToAdd: 2 });
    expect(after.rows.every((row) => row.passwordHash === null && row.outcome === null)).toBe(true);
    expect(await staffCount()).toBe(members);
    await tight.disconnect();
  });

  it("fails for an importer who lost staff:manage", async () => {
    const lead = await addStaffMember(world.identity, world.owner, `lead-${code}`, "org-admin");
    const importer = await memberAccessOf(world.identity, lead.userId, world.agency.organizationId);
    const one = person("One");
    const checked = await checkedStaffImport(world, { ...standard, importer, rows: [one.row] });
    await setStaffImportPasswords(world.test.db, world.identity, importer, {
      importId: checked.id,
      passwords: [{ rowNumber: 2, password: passwordOf(2) }],
    });
    await requestStaffImportAdd(world.test.db, world.identity, importer, checked.id, new Date());
    await world.identity.staff.updateRole(world.owner, { memberId: lead.memberId, roleKey: "sales" });
    const before = await staffCount();
    await run(checked.id);
    const after = await readImport(world, checked.id);
    expect(after.batch).toMatchObject({ status: "failed", failureReason: "lost_permission" });
    expect(after.rows.every((row) => row.passwordHash === null)).toBe(true);
    expect(await staffCount()).toBe(before);
  });

  it("only ends an import whose accounts were already written, and ignores a repeat", async () => {
    const one = person("One");
    const checked = await withPasswords([one.row]);
    await requestStaffImportAdd(world.test.db, world.identity, world.admin, checked.id, new Date());
    // The accounts and their links were committed, then the job died before it ended the import.
    const waiting = await world.test.db.forOrg(world.agency.organizationId, (tx) =>
      tx.importRow.findFirstOrThrow({ where: { batchId: checked.id } }),
    );
    await world.identity.staff.addImported(
      world.admin,
      [
        {
          rowNumber: 2,
          name: "One",
          username: one.username,
          roleKey: "sales",
          passwordHash: waiting.passwordHash ?? "",
        },
      ],
      checked.id,
      async (tx, added) => {
        await tx.importRow.updateMany({
          where: { batchId: checked.id },
          data: { outcome: "added", memberId: added[0]?.memberId ?? null, passwordHash: null },
        });
      },
    );
    const before = await staffCount();
    await run(checked.id);
    expect((await readImport(world, checked.id)).batch.status).toBe("done");
    await run(checked.id);
    expect(await staffCount()).toBe(before);
  });

  it("ends as done, never back at the preview, when a run beside it added the people first", async () => {
    const one = person("One");
    const checked = await withPasswords([one.row, person("Two").row]);
    await requestStaffImportAdd(world.test.db, world.identity, world.admin, checked.id, new Date());
    // The other run commits its accounts and their links while this one is between its look and its write.
    const beside = {
      ...world.identity,
      staff: {
        ...world.identity.staff,
        addImported: async (...given: Parameters<typeof world.identity.staff.addImported>) => {
          await world.identity.staff.addImported(...given);
          throw new ImportedStaffRowError(2, "taken_meanwhile");
        },
      },
    };
    const before = await staffCount();
    await run(checked.id, beside);
    const after = await readImport(world, checked.id);
    expect(after.batch.status).toBe("done");
    expect(after.rows.map((row) => row.outcome)).toEqual(["added", "added"]);
    expect(await staffCount()).toBe(before + 2);
  });
});
