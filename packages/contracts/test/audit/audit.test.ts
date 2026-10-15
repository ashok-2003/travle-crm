// The audit log's contract: list filters come in pairs, pages are bounded, and entries show where a change came from.
import { describe, expect, it } from "vitest";
import { auditEntry, listAuditEntriesInput } from "../../src/audit/index.js";

const memberId = "0199e7a0-0000-7000-8000-0000000000b1";

describe("audit contracts", () => {
  it("lists 50 entries by default, and 1 to 100 when asked", () => {
    expect(listAuditEntriesInput.parse({})).toEqual({ limit: 50 });
    expect(listAuditEntriesInput.safeParse({ limit: 100 }).success).toBe(true);
    expect(listAuditEntriesInput.safeParse({ limit: 0 }).success).toBe(false);
    expect(listAuditEntriesInput.safeParse({ limit: 101 }).success).toBe(false);
    expect(listAuditEntriesInput.safeParse({ limit: 2.5 }).success).toBe(false);
  });

  it("filters by one record only with both its type and its id", () => {
    expect(listAuditEntriesInput.safeParse({ entityType: "member", entityId: memberId }).success).toBe(true);
    const typeOnly = listAuditEntriesInput.safeParse({ entityType: "member" });
    expect(typeOnly.success).toBe(false);
    expect(typeOnly.error?.issues[0]?.path).toEqual(["entityId"]);
    expect(listAuditEntriesInput.safeParse({ entityId: memberId }).success).toBe(false);
    expect(listAuditEntriesInput.safeParse({ entityType: "Member", entityId: memberId }).success).toBe(false);
  });

  it("refuses unknown keys and a cursor that isn't an entry id", () => {
    expect(listAuditEntriesInput.safeParse({ organizationId: memberId }).success).toBe(false);
    expect(listAuditEntriesInput.safeParse({ before: "yesterday" }).success).toBe(false);
  });

  it("describes an entry made while support impersonated a member", () => {
    const entry = {
      id: "0199e7a0-0000-7000-8000-0000000000c1",
      occurredAt: "2026-10-15T09:30:00.000Z",
      actorUserId: "0199e7a0-0000-7000-8000-0000000000d1",
      source: "impersonation",
      impersonatedBy: "0199e7a0-0000-7000-8000-0000000000e1",
      action: "role.updated",
      entityType: "role",
      entityId: memberId,
      before: { name: "Sales" },
      after: { name: "Senior sales" },
    };
    expect(auditEntry.parse(entry)).toEqual(entry);
    expect(auditEntry.safeParse({ ...entry, source: "email" }).success).toBe(false);
  });

  it("describes an entry made by a platform admin from the console", () => {
    const entry = {
      id: "0199e7a0-0000-7000-8000-0000000000c2",
      occurredAt: "2026-10-16T09:30:00.000Z",
      actorUserId: "0199e7a0-0000-7000-8000-0000000000e1",
      source: "platform",
      impersonatedBy: null,
      action: "staff.created",
      entityType: "member",
      entityId: memberId,
      before: null,
      after: { role: "owner", hasEmail: true },
    };
    expect(auditEntry.parse(entry)).toEqual(entry);
  });
});
