// An import is its starter's (D6), kept a week from its last change (D5), listed among their last ten; the job acts as
// the importer only while they may still import (B31); and a row's reasons travel as text (D8).
import { randomUUID } from "node:crypto";
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cancelImport,
  decodeRowReason,
  encodeRowReason,
  findImport,
  importerAccess,
  recentImports,
} from "../../src/imports/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import type { Entitlements } from "../../src/subscriptions/index.js";
import { aBatch } from "./support/batches.js";
import { anAgency, createTestImports, memberOf, type TestImports } from "./support/test-imports.js";

const week = 7 * 24 * 60 * 60 * 1000;

function entitlements(access: Entitlements["access"], modules: readonly string[] = ["crm"]): Entitlements {
  return {
    status: access === "full" ? "active" : "read_only",
    access,
    planName: "Growth",
    modules: new Set(modules) as Entitlements["modules"],
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1_000_000 },
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
  };
}

/** The job's dependencies: identity answers with `access` for anyone, the subscription with `today`. */
const jobWith = (access: MemberAccess | null, today: Entitlements | null = entitlements("full")) => ({
  identity: { resolveAccess: () => Promise.resolve(access) },
  subscriptions: { entitlementsOf: () => Promise.resolve(today) },
});

describe("an import's batch", () => {
  let test: TestImports;
  let organizationId: string;
  let importer: MemberAccess;

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    importer = memberOf(organizationId);
  });

  afterAll(async () => {
    await test.close();
  });

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);

  it("reads a sheet's import with its connection and in-CRM choice, and a file's as before", async () => {
    const sheetId = "0199e7a0-0000-7000-8000-0000000000c2";
    const fromSheet = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, sourceSheetId: sheetId }));
    await expect(inOrg((tx) => findImport(tx, importer, "leads", fromSheet.id))).resolves.toMatchObject({
      sourceSheetId: sheetId,
      addInCrm: false,
    });
    const file = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId }));
    await expect(inOrg((tx) => findImport(tx, importer, "leads", file.id))).resolves.toMatchObject({
      sourceSheetId: null,
      addInCrm: false,
    });
  });

  it("answers NOT_FOUND for another person's import, another kind's, or another organization's", async () => {
    const { id } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId }));
    await expect(inOrg((tx) => findImport(tx, importer, "leads", id))).resolves.toMatchObject({ id, kind: "leads" });
    const colleague = memberOf(organizationId);
    const elsewhere = memberOf(await anAgency(test, "Another agency"), "org-admin", { userId: importer.userId });
    const notFound = { code: "NOT_FOUND", reason: "NOT_FOUND" };
    await expect(inOrg((tx) => findImport(tx, colleague, "leads", id))).rejects.toMatchObject(notFound);
    await expect(inOrg((tx) => findImport(tx, importer, "staff", id))).rejects.toMatchObject(notFound);
    await expect(
      test.db.forOrg(elsewhere.organizationId, (tx) => findImport(tx, elsewhere, "leads", id)),
    ).rejects.toMatchObject(notFound);
  });

  it("keeps each import 7 days from its last change", async () => {
    const { id } = await inOrg((tx) =>
      aBatch(tx, { startedBy: importer.userId, status: "matching", keepUntil: new Date(0) }),
    );
    const now = new Date("2026-10-20T10:00:00Z");
    await inOrg((tx) => cancelImport(tx, importer, "leads", id, now));
    const batch = await inOrg((tx) => findImport(tx, importer, "leads", id));
    expect(batch).toMatchObject({ status: "cancelled", finishedAt: now });
    expect(batch.keepUntil.getTime() - now.getTime()).toBe(week);
  });

  it("lists the person's last ten imports of the kind, newest first", async () => {
    const organization = await anAgency(test, "Recent imports");
    const person = memberOf(organization);
    const created: string[] = [];
    await test.db.forOrg(organization, async (tx) => {
      for (let index = 0; index < 12; index += 1) {
        created.push(
          (await aBatch(tx, { startedBy: person.userId, fileName: `file-${String(index)}.csv`, rowsTotal: index })).id,
        );
      }
      await aBatch(tx, { startedBy: person.userId, kind: "staff" });
      await aBatch(tx, { startedBy: randomUUID() });
    });
    const recent = await test.db.forOrg(organization, (tx) => recentImports(tx, person, "leads"));
    expect(recent.map((item) => item.id)).toEqual(created.slice(2).reverse());
    expect(recent[0]).toMatchObject({ fileName: "file-11.csv", status: "checked", rowsTotal: 11, rowsAdded: 0 });
    expect(typeof recent[0]?.createdAt).toBe("string");
  });

  it("fails the job's access for a removed member, a lost permission, or an agency that can't make changes", async () => {
    const { id } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId }));
    const batch = await inOrg((tx) => findImport(tx, importer, "leads", id));
    const required = ["leads:create", "leads:assign"] as const;
    expect(await importerAccess(jobWith(null), batch, required)).toEqual({ failure: "no_longer_a_member" });
    const sales = memberOf(organizationId, "sales", { userId: importer.userId });
    expect(await importerAccess(jobWith(sales), batch, required)).toEqual({ failure: "lost_permission" });
    for (const today of [entitlements("read_only"), entitlements("full", []), null]) {
      expect(await importerAccess(jobWith(importer, today), batch, required)).toEqual({
        failure: "organization_cannot_change",
      });
    }
    // staff:manage is the Foundation's own: no plan module needed.
    expect(await importerAccess(jobWith(importer, entitlements("full", [])), batch, ["staff:manage"])).toHaveProperty(
      "access",
    );
  });

  it("acts in the job as the importer, source job, keeping who impersonated them", async () => {
    const supportUserId = randomUUID();
    const { id } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId }));
    const batch = await inOrg((tx) => findImport(tx, importer, "leads", id));
    const result = await importerAccess(jobWith(importer), batch, ["leads:create"]);
    expect(result).toEqual({ access: { ...importer, source: "job", impersonatedBy: null } });
    // Support started it while impersonating: the job's changes are recorded as theirs, as import.started was.
    const impersonated = { ...batch, impersonatedBy: supportUserId };
    expect(await importerAccess(jobWith(importer), impersonated, ["leads:create"])).toEqual({
      access: { ...importer, source: "impersonation", impersonatedBy: supportUserId },
    });
  });

  it("writes a row's reasons as text and reads them back", () => {
    const reasons = [
      { code: "no_contact" },
      { code: "notes_too_long", field: "note" },
      { code: "same_as_row", row: 12 },
      { code: "already_imported", on: "2026-10-12" },
      { code: "same_username_as_row", row: 4 },
    ] as const;
    const texts = reasons.map(encodeRowReason);
    expect(texts).toEqual([
      "no_contact",
      "notes_too_long:note",
      "same_as_row:12",
      "already_imported:2026-10-12",
      "same_username_as_row:4",
    ]);
    expect(texts.map(decodeRowReason)).toEqual(reasons);
    expect(() => decodeRowReason("lost_my_way")).toThrow(RangeError);
  });
});
