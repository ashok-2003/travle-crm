// The staff import's check (B43-B45, D23): a dry run over a staff file against the agency's staff, roles and seats, on
// the real identity. Each row is planned new, or not added with its reasons; nothing is added.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ImportField } from "@travel-crm/contracts/imports";
import {
  checkStaffImportListener,
  importRowsPage,
  readStaffRow,
  staffImportDetail,
  type ColumnMatches,
} from "../../../src/imports/index.js";
import { addStaffMember, createTestAgency, memberAccessOf } from "../../identity/test-identity.js";
import { anImportWithFile, listenerContext } from "../support/test-imports.js";
import {
  checkedStaffImport,
  createStaffWorld,
  dependenciesOn,
  identityOn,
  standardFile as standard,
  stepEvent,
  type StaffFile,
  type StaffWorld,
} from "./support.js";

describe("the staff import's check", () => {
  let world: StaffWorld;

  /** Runs the check over a file, and reads back every row. */
  const checked = (file: Omit<StaffFile, "fields"> & { fields?: StaffFile["fields"] }) =>
    checkedStaffImport(world, { fields: standard.fields, roles: standard.roles, ...file }).then((result) => ({
      ...result,
    }));

  beforeAll(async () => {
    world = await createStaffWorld();
    await addStaffMember(world.identity, world.owner, "existing", "sales");
  });

  afterAll(async () => {
    await world.close();
  });

  it("reads Name, Username, Email, Phone and Role with Add staff's own schemas", () => {
    const columns: ColumnMatches = {
      fieldOf: new Map<number, ImportField>([
        [0, "name"],
        [1, "username"],
        [2, "email"],
        [3, "phone"],
        [4, "role"],
      ]),
      positionsOf(field) {
        return [...this.fieldOf].filter(([, matched]) => matched === field).map(([position]) => position);
      },
    };
    const context = { columns, roleOf: (value: string) => (value === "Sales" ? "sales" : null), defaultRoleKey: null };
    expect(
      readStaffRow(
        { rowNumber: 2, cells: ["  Ravi Kumar ", " Ravi.K ", "Ravi@Sharma.IN", "98765 43210", "Sales"] },
        context,
      ),
    ).toEqual({
      kind: "ready",
      values: {
        rowNumber: 2,
        name: "Ravi Kumar",
        username: "Ravi.K",
        email: "ravi@sharma.in",
        phone: "+919876543210",
        roleKey: "sales",
      },
    });
    expect(readStaffRow({ rowNumber: 3, cells: ["Meera", null, "meera@sharma.in", null, "Sales"] }, context)).toEqual({
      kind: "ready",
      values: { rowNumber: 3, name: "Meera", email: "meera@sharma.in", roleKey: "sales" },
    });
  });

  it("plans a good file's rows new, and counts them beside the seats free", async () => {
    const { id, batch, rows } = await checked({
      ...standard,
      rows: [
        ["Ravi Kumar", "ravi.good", null, "98765 43210", "Sales"],
        ["Meera", null, "meera.good@example.test", null, "Operations"],
      ],
    });
    expect(rows.map((row) => [row.rowNumber, row.plan])).toEqual([
      [2, "new"],
      [3, "new"],
    ]);
    expect(batch).toMatchObject({ status: "checked", rowsTotal: 2, rowsToAdd: 2 });
    const detail = await staffImportDetail(world.test.db, world.identity, world.admin, id);
    expect(detail.counts?.byPlan.new).toBe(2);
    expect(detail.seats).toEqual({ free: null });
    const limited = identityOn(14);
    try {
      const members = (await limited.staff.list(world.admin)).length;
      expect((await staffImportDetail(world.test.db, limited, world.admin, id)).seats).toEqual({ free: 14 - members });
    } finally {
      await limited.disconnect();
    }
  });

  it("leaves out a row with no name, no username or email, or a username or email another row uses", async () => {
    const { byRow } = await checked({
      ...standard,
      rows: [
        ["First", "dupe.user", "dupe@example.test", null, "Sales"],
        [null, "no.name", null, null, "Sales"],
        ["No sign in", null, null, null, "Sales"],
        ["Same username", "DUPE.user", null, null, "Sales"],
        ["Same email", null, "Dupe@Example.test", null, "Sales"],
      ],
    });
    expect(byRow(2)?.plan).toBe("new");
    expect(byRow(3)?.reasons).toEqual(["no_name"]);
    expect(byRow(4)?.reasons).toEqual(["no_sign_in_name"]);
    expect(byRow(5)?.reasons).toEqual(["same_username_as_row:2"]);
    expect(byRow(6)?.reasons).toEqual(["same_email_as_row:2"]);
    expect(byRow(5)).toMatchObject({ plan: "not_added", exampleName: "Same username", exampleValue: "DUPE.user" });
  });

  it("leaves out an email on another organization's account, a bad username, email or phone, and a role unmatched", async () => {
    const other = await createTestAgency(world.identity, world.platform);
    const { byRow } = await checked({
      ...standard,
      rows: [
        ["Elsewhere", "els.where", other.ownerEmail, null, "Sales"],
        ["Bad username", "x", null, null, "Sales"],
        ["Bad email", null, "not-an-email", null, "Sales"],
        ["Placeholder", null, "someone@no-email.invalid", null, "Sales"],
        ["Bad phone", "bad.phone", null, "12345", "Sales"],
        ["No role", "no.role", null, null, "Pilot"],
        ["Blank role", "blank.role", null, null, null],
        ["Fine", "fine.one", null, null, "Sales"],
      ],
      roles: { ...standard.roles, Pilot: null },
    });
    expect(byRow(2)?.reasons).toEqual(["email_elsewhere:email"]);
    expect(byRow(3)?.reasons).toEqual(["invalid_username:username"]);
    expect(byRow(4)?.reasons).toEqual(["invalid_email:email"]);
    expect(byRow(5)?.reasons).toEqual(["invalid_email:email"]);
    expect(byRow(6)?.reasons).toEqual(["invalid_phone:phone"]);
    expect(byRow(7)?.reasons).toEqual(["role_unmatched:role"]);
    expect(byRow(8)?.reasons).toEqual(["role_unmatched:role"]);
    expect(byRow(9)?.plan).toBe("new");
  });

  it("leaves out the Owner role and a role world.above the importer's", async () => {
    const { byRow } = await checked({
      ...standard,
      rows: [
        ["Boss", "the.boss", null, null, "Owner"],
        ["Director", "a.director", null, null, "Directors"],
        ["Fine", "just.fine", null, null, "Sales"],
      ],
      roles: { ...standard.roles, Directors: world.above },
    });
    expect(byRow(2)?.reasons).toEqual(["owner_role:role"]);
    expect(byRow(3)?.reasons).toEqual(["role_above_yours:role"]);
    expect(byRow(4)?.plan).toBe("new");
    // The Owner role is refused even to an Owner: it is added one at a time, from Add staff.
    const ownersCheck = await checked({
      ...standard,
      importer: world.owner,
      rows: [["Boss", "the.boss2", null, null, "Owner"]],
    });
    expect(ownersCheck.byRow(2)?.reasons).toEqual(["owner_role:role"]);
  });

  it("calls a username or email already an active member here Already on your staff", async () => {
    const { id, byRow } = await checked({
      ...standard,
      rows: [
        ["Existing again", "EXISTING", null, null, "Sales"],
        ["Owner again", null, world.agency.ownerEmail, null, "Sales"],
        ["New", "brand.new", null, null, "Sales"],
      ],
    });
    expect(byRow(2)?.reasons).toEqual(["already_on_staff"]);
    expect(byRow(3)?.reasons).toEqual(["already_on_staff"]);
    expect(byRow(4)?.plan).toBe("new");
    const page = await world.test.db.forOrg(world.agency.organizationId, (tx) =>
      importRowsPage(tx, world.admin, "staff", {
        importId: id,
        plan: "not_added",
        reason: "already_on_staff",
        limit: 5,
      }),
    );
    expect(page.items.map((row) => row.rowNumber)).toEqual([2, 3]);
  });

  it("gives every row the file's role when there's no Role column", async () => {
    const { byRow, batch } = await checked({
      header: ["Name", "Username"],
      fields: ["name", "username"],
      rows: [
        ["One", "one.default"],
        ["Two", "two.default"],
      ],
      defaultRoleKey: "operations",
    });
    expect([byRow(2)?.plan, byRow(3)?.plan]).toEqual(["new", "new"]);
    expect(batch.rowsToAdd).toBe(2);
    const without = await checked({
      header: ["Name", "Username"],
      fields: ["name", "username"],
      rows: [["One", "x.y"]],
    });
    expect(without.byRow(2)?.reasons).toEqual(["role_unmatched:role"]);
  });

  it("ends the import failed when the importer lost staff:manage, and leaves a lead import alone", async () => {
    const sales = await memberAccessOf(
      world.identity,
      (await addStaffMember(world.identity, world.owner, "no-manage", "sales")).userId,
      world.agency.organizationId,
    );
    const lost = await checked({ ...standard, importer: sales, rows: [["Ravi", "r.avi", null, null, "Sales"]] });
    expect(lost.batch).toMatchObject({ status: "failed", failureReason: "lost_permission" });
    expect(lost.rows).toHaveLength(0);
    const file = world.test.spreadsheets.bytesOf({ header: ["Name"], rows: [["Ravi"]] });
    const lead = await anImportWithFile(world.test, world.admin, file, { status: "checking" });
    await expect(
      checkStaffImportListener(dependenciesOn(world, world.identity)).handle(
        stepEvent(world, "import.columns-matched", lead.id, "leads"),
        listenerContext(world.test, world.agency.organizationId),
      ),
    ).resolves.toBeUndefined();
  });

  it("does nothing for an import no longer checking, so a repeat is harmless", async () => {
    const first = await checked({ ...standard, rows: [["Ravi", "repeat.me", null, null, "Sales"]] });
    expect(first.batch.status).toBe("checked");
    await checkStaffImportListener(dependenciesOn(world, world.identity)).handle(
      stepEvent(world, "import.columns-matched", first.id),
      listenerContext(world.test, world.agency.organizationId),
    );
    expect(
      await world.test.db.forOrg(world.agency.organizationId, (tx) =>
        tx.importRow.count({ where: { batchId: first.id } }),
      ),
    ).toBe(1);
  });
});
