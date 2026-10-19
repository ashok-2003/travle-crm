// The staff export (B52): the active staff oldest first as the Staff screen lists them, named staff-yyyy-mm-dd on the
// agency's clock, one export.made entry, and only for someone who may manage staff. On the real identity.
import { calendarDateIn } from "../../src/kernel/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportDetail, makeStaffExportListener, startExport } from "../../src/exports/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { addStaffMember, memberAccessOf } from "../identity/test-identity.js";
import { createStaffWorld, type StaffWorld } from "../imports/staff/support.js";
import { auditOf, listenerContext } from "../imports/support/test-imports.js";
import { requested } from "./test-exports.js";

describe("the staff export", () => {
  let world: StaffWorld;
  let organizationId: string;
  let zone: string;
  const dependencies = () => ({
    files: world.test.files,
    spreadsheets: world.test.spreadsheets,
    identity: world.identity,
    appUrl: "https://app.example.test",
  });
  const inOrg = <T>(work: Parameters<typeof world.test.db.forOrg<T>>[1]) => world.test.db.forOrg(organizationId, work);
  const exportBy = async (
    requester: MemberAccess,
    kind: "staff" | "leads" = "staff",
    format: "xlsx" | "csv" = "xlsx",
  ) => {
    const { exportId } = await inOrg((tx) => startExport(tx, requester, kind, { format, filter: {} }, new Date()));
    await makeStaffExportListener(dependencies()).handle(
      requested(organizationId, exportId, kind),
      listenerContext(world.test, organizationId),
    );
    return exportId;
  };

  beforeAll(async () => {
    world = await createStaffWorld();
    organizationId = world.agency.organizationId;
    zone = (await world.platform.organization.findUniqueOrThrow({ where: { id: organizationId } })).timeZone;
  });

  afterAll(async () => {
    await world.close();
  });

  it("exports the active staff oldest first: Name, Username, Email (blank without one), Phone, Role, Joined, Status, Last active", async () => {
    const ravi = await world.identity.staff.create(world.owner, {
      name: "Ravi Kumar",
      username: "ravi.export",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
      phone: "+919876501234",
    });
    const gone = await addStaffMember(world.identity, world.owner, "gone.export", "sales");
    await world.identity.staff.remove(world.owner, { memberId: gone.memberId });
    await world.platform.user.update({ where: { id: world.agency.ownerUserId }, data: { mustChangePassword: false } });
    // The Owner was last active at 21:30 UTC on 14 Oct, which is already 15 Oct in India.
    await world.platform.member.update({
      where: { id: world.agency.ownerMemberId },
      data: { lastActiveAt: new Date("2026-10-14T21:30:00Z") },
    });
    const requester = await memberAccessOf(world.identity, world.admin.userId, organizationId);
    const exportId = await exportBy(requester);
    expect(await inOrg((tx) => exportDetail(tx, requester, "staff", exportId))).toMatchObject({
      status: "ready",
      rowsTotal: 3,
      rowsDone: 3,
    });
    const written = world.test.spreadsheets.written.at(-1);
    expect(written?.columns.map((column) => [column.header, column.kind])).toEqual([
      ["Name", "text"],
      ["Username", "text"],
      ["Email", "text"],
      ["Phone", "phone"],
      ["Role", "text"],
      ["Joined", "date"],
      ["Status", "text"],
      ["Last active", "date"],
    ]);
    const joined = (iso: Date) => calendarDateIn(iso, zone);
    const members = await world.platform.member.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "asc" }],
    });
    const createdOf = (memberId: string) =>
      joined(members.find((member) => member.id === memberId)?.createdAt ?? new Date());
    expect(written?.rows).toEqual([
      [
        "Asha Owner",
        null,
        world.agency.ownerEmail,
        null,
        "Owner",
        createdOf(world.agency.ownerMemberId),
        "Active",
        "2026-10-15",
      ],
      ["Admin", "the-admin", null, null, "Admin", createdOf(world.admin.memberId), "Must change password", null],
      [
        "Ravi Kumar",
        "ravi.export",
        null,
        "+91 98765 01234",
        "Sales",
        createdOf(ravi.memberId),
        "Must change password",
        null,
      ],
    ]);
  });

  it("names the file staff-yyyy-mm-dd on the agency's clock and records export.made without a filter", async () => {
    const exportId = await exportBy(world.admin, "staff", "csv");
    const file = await inOrg((tx) =>
      tx.attachment.findMany({ where: { recordType: "data_export", recordId: exportId } }),
    );
    expect(file.map((attachment) => attachment.fileName)).toEqual([`staff-${calendarDateIn(new Date(), zone)}.csv`]);
    const entries = await auditOf(world.test, organizationId, exportId);
    expect(entries.map((entry) => [entry.action, entry.after])).toEqual([
      ["export.made", { kind: "staff", format: "csv", rows: 3, filter: null }],
    ]);
  });

  it("fails for a requester who may not manage staff, and leaves a lead export alone", async () => {
    const seller = await memberAccessOf(
      world.identity,
      (await addStaffMember(world.identity, world.owner, "seller.export", "sales")).userId,
      organizationId,
    );
    const exportId = await exportBy(seller);
    expect(await inOrg((tx) => exportDetail(tx, seller, "staff", exportId))).toMatchObject({
      status: "failed",
      failureReason: "lost_permission",
      file: null,
    });
    const lead = await inOrg((tx) => startExport(tx, world.admin, "leads", { format: "xlsx", filter: {} }, new Date()));
    await makeStaffExportListener(dependencies()).handle(
      requested(organizationId, lead.exportId),
      listenerContext(world.test, organizationId),
    );
    expect(await inOrg((tx) => exportDetail(tx, world.admin, "leads", lead.exportId))).toMatchObject({
      status: "making",
    });
  });
});
