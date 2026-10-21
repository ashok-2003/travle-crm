// Erasing a customer who is in a sheet (S43, spec 9): their rows keep only keyed hashes and lose their ids, their contacts
// become tombstones and nothing else, every example in the organization is emptied, a row of theirs read after the erasure
// is not added, a different row naming their phone is left out, and a missing key fails the job loudly rather than skip.
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { checkLeadSheet } from "../../src/crm/index.js";
import { exportSubject, eraseSubject, requestErasure, ERASE_SUBJECT_QUEUE } from "../../src/platform/index.js";
import { erasureJobOf } from "../../src/platform/erasure.js";
import { createSheetsHashes, hex, lockSheetConnections, rowHash, withdrawSheetRows } from "../../src/sheets/index.js";
import { aLead, aPerson, freshPhone } from "../crm/support/records.js";
import { deletionAgency, type DeletionAgency } from "../platform/test-deletion.js";
import { createTestPlan, createTestPlatform, support, type TestPlatform } from "../platform/test-platform.js";
import { fakeIdentity } from "../imports/support/test-imports.js";
import { aSheet, aSheetRow, checkDependencies, createTestSheets, aRunningSheet } from "./support/sheets.js";
import { sheetsHashKey } from "./support/sheets.js";

describe("erasing a customer who is in a sheet", () => {
  let platformTest: TestPlatform;
  let plan: PlanSummary;
  let platform: PlatformClient;
  const sheets = createTestSheets();
  const hashes = createSheetsHashes(sheetsHashKey);

  beforeAll(async () => {
    platformTest = createTestPlatform();
    platformTest.services.sheetsHashes = hashes;
    plan = await createTestPlan(platformTest);
    platform = createPlatformClient(inject("dbUrls").platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
    await platformTest.close();
    await sheets.close();
  });

  /** A customer with a lead and a row in a sheet, a stranger with one too, and a problem line naming a third person. */
  async function inASheet(agency: DeletionAgency) {
    const phone = freshPhone();
    const email = `neha.${Date.now().toString()}@example.test`;
    return platformTest.services.db.forOrg(agency.organizationId, async (tx) => {
      const person = await aPerson(tx, { name: "Neha Joshi", phoneE164: phone, email });
      const lead = await aLead(tx, { personId: person.id, ownerUserId: agency.owner.userId });
      const stranger = await aPerson(tx, { name: "Ravi Kumar", phoneE164: freshPhone() });
      const strangerLead = await aLead(tx, { personId: stranger.id });
      const sheet = await aSheet(tx, { connectedBy: agency.owner.userId });
      const plain = rowHash(["Neha Joshi", phone]);
      const fingerprint = new Uint8Array(32).fill(9);
      const row = await aSheetRow(tx, {
        connectionId: sheet.id,
        status: "added",
        rawHash: plain,
        fingerprint,
        leadId: lead.id,
        personId: person.id,
        rowNumber: 2,
      });
      const strangerRow = await aSheetRow(tx, {
        connectionId: sheet.id,
        status: "merged",
        cells: ["Ravi Kumar"],
        fingerprint: new Uint8Array(32).fill(8),
        leadId: strangerLead.id,
        personId: stranger.id,
        rowNumber: 3,
      });
      const problem = await aSheetRow(tx, {
        connectionId: sheet.id,
        status: "not_added",
        cells: ["problem"],
        reasons: ["no_contact"],
        exampleName: "Third Person",
        exampleValue: "98765",
        rowNumber: 4,
      });
      return { person, phone, email, plain, fingerprint, sheet, row, strangerRow, problem, stranger };
    });
  }

  async function erase(agency: DeletionAgency, personId: string) {
    const subject = { kind: "record" as const, recordType: "person", recordId: personId };
    const { organizationId, code } = agency;
    await exportSubject(platformTest.services, support, { organizationId, subject });
    await requestErasure(platformTest.services, support, { organizationId, subject, confirmation: code });
    const sent = platformTest.queue.sent.at(-1);
    if (sent?.queue !== ERASE_SUBJECT_QUEUE) throw new Error("no erasure job was queued");
    await eraseSubject(platformTest.services, erasureJobOf(sent.data));
  }

  it("re-keys the person's rows and empties their ids and examples", async () => {
    const agency = await deletionAgency(platformTest, plan);
    const seeded = await inASheet(agency);
    await erase(agency, seeded.person.id);
    const row = await platform.sheetRow.findUniqueOrThrow({ where: { id: seeded.row.id } });
    expect(row).toMatchObject({ status: "erased", leadId: null, personId: null, exampleName: null });
    expect(hex(row.rawHash)).toBe(hex(hashes.rekey(seeded.plain)));
    expect(hex(row.rawHash)).not.toBe(hex(seeded.plain));
    expect(hex(row.fingerprint ?? new Uint8Array())).toBe(hex(hashes.rekey(seeded.fingerprint)));
    // Another person's row is as it was.
    expect(await platform.sheetRow.findUniqueOrThrow({ where: { id: seeded.strangerRow.id } })).toMatchObject({
      status: "merged",
      personId: seeded.stranger.id,
    });
    const log = await platform.platformAuditEntry.findFirstOrThrow({
      where: { action: "subject.erased", targetOrganizationId: agency.organizationId },
    });
    expect(log.after).toMatchObject({ customer: { sheetRowsWithdrawn: 1 } });
  });

  it("waits for a check holding the sheet's connection, taking the connections before the people (no crossing)", async () => {
    const agency = await deletionAgency(platformTest, plan);
    const seeded = await inASheet(agency);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held: () => void = () => undefined;
    const holding = new Promise<void>((resolve) => {
      held = resolve;
    });
    // A check's batch: the connection locked first, then a person's lead.
    const check = platformTest.services.db.forOrg(agency.organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM sheet_connection WHERE organization_id = ${agency.organizationId}::uuid FOR NO KEY UPDATE`;
      held();
      await gate;
    });
    await holding;
    let erased = false;
    const erasing = erase(agency, seeded.person.id).then(() => {
      erased = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(erased).toBe(false);
    release();
    await check;
    await erasing;
    expect(erased).toBe(true);
  });

  it("keeps only keyed hashes of the contacts, and no plaintext anywhere", async () => {
    const agency = await deletionAgency(platformTest, plan);
    const seeded = await inASheet(agency);
    await erase(agency, seeded.person.id);
    const tombstones = await platform.sheetErasedContact.findMany({ where: { organizationId: agency.organizationId } });
    expect(tombstones.map((tombstone) => hex(tombstone.contactHash)).sort()).toEqual(
      [hex(hashes.contactHash("phone", seeded.phone)), hex(hashes.contactHash("email", seeded.email))].sort(),
    );
    // Nothing of the sheet's tables holds the phone, the email or the name, as text.
    const everything = JSON.stringify({
      rows: await platform.sheetRow.findMany({ where: { organizationId: agency.organizationId } }),
      contacts: tombstones,
      connections: await platform.sheetConnection.findMany({ where: { organizationId: agency.organizationId } }),
    });
    for (const secret of [seeded.phone, seeded.email, "Neha", "Joshi"]) expect(everything).not.toContain(secret);
  });

  it("empties every example in the organization", async () => {
    const agency = await deletionAgency(platformTest, plan);
    const seeded = await inASheet(agency);
    await erase(agency, seeded.person.id);
    const problem = await platform.sheetRow.findUniqueOrThrow({ where: { id: seeded.problem.id } });
    expect(problem).toMatchObject({ exampleName: null, exampleValue: null, status: "not_added" });
  });

  it("fails loudly rather than skipping when the hash key is missing and the organization has sheet rows, and does nothing when it has none", async () => {
    const withSheets = await deletionAgency(platformTest, plan);
    const seeded = await inASheet(withSheets);
    await expect(
      platformTest.services.platformDb.transaction((tx) =>
        withdrawSheetRows(tx, null, {
          organizationId: withSheets.organizationId,
          personId: seeded.person.id,
          contacts: { phones: [seeded.phone], emails: [], instagramHandles: [] },
          now: new Date(),
        }),
      ),
    ).rejects.toThrow("SHEETS_HASH_KEY");
    const without = await deletionAgency(platformTest, plan);
    await expect(
      platformTest.services.platformDb.transaction((tx) =>
        withdrawSheetRows(tx, null, {
          organizationId: without.organizationId,
          personId: seeded.person.id,
          contacts: { phones: [], emails: [], instagramHandles: [] },
          now: new Date(),
        }),
      ),
    ).resolves.toEqual({ rowsWithdrawn: 0, contactsKept: 0, examplesEmptied: 0 });
  });

  it("never lets an erased customer's row come back from a full read or Sync now, and leaves out a different row naming their phone", async () => {
    const agency = await sheets.platform.organization
      .create({ data: { name: "Erasure flow", code: `E${Date.now().toString(36).toUpperCase().slice(-10)}` } })
      .then((organization) => organization.id);
    const importer = (await import("./support/sheets.js")).memberOf(agency);
    const identity = fakeIdentity({ access: importer, firstOwner: importer.userId });
    const header = ["Timestamp", "Full name", "Phone number", "Email Address"];
    const running = await aRunningSheet(sheets, importer, {
      rows: [header],
      fields: { timestamp: "enquiry_date", fullname: "name", phonenumber: "phone", emailaddress: "email" },
      identity,
    });
    const phone = freshPhone();
    const append = (cells: string[]) => {
      sheets.google.append(running.spreadsheetId, "Form responses 1", cells);
    };
    append(["19/10/2026 14:00:00", "Neha Joshi", phone, ""]);
    const dependencies = checkDependencies(sheets, { identity });
    const check = (mode: "scheduled" | "sync-now") =>
      checkLeadSheet(dependencies, { organizationId: agency, sheetId: running.sheetId, mode });
    await check("scheduled");
    const person = await sheets.db.forOrg(agency, (tx) => tx.person.findFirstOrThrow({ where: { phoneE164: phone } }));
    // The console erases her, with the platform's key; the agency's own sheet still holds her row.
    const platformDb = platformTest.services.platformDb;
    await platformDb.transaction(async (tx) => {
      const { customerContacts, eraseCustomer } = await import("../../src/crm/index.js");
      const contacts = await customerContacts(tx, { organizationId: agency, personId: person.id });
      await eraseCustomer(tx, { organizationId: agency, personId: person.id });
      await withdrawSheetRows(tx, hashes, { organizationId: agency, personId: person.id, contacts, now: new Date() });
    });
    expect(await sheets.platform.lead.count({ where: { organizationId: agency, deletedAt: null } })).toBe(0);
    // Read again by a full read and Sync now: the same row is known (by its keyed hash) and adds nothing.
    await check("sync-now");
    await check("sync-now");
    expect(await sheets.platform.lead.count({ where: { organizationId: agency, deletedAt: null } })).toBe(0);
    // A different row naming her phone is left out as erased, and shows no name.
    append(["19/10/2026 15:00:00", "Neha J", phone, "other@example.test"]);
    await check("scheduled");
    expect(await sheets.platform.lead.count({ where: { organizationId: agency, deletedAt: null } })).toBe(0);
    const left = await sheets.platform.sheetRow.findMany({ where: { organizationId: agency, status: "not_added" } });
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ reasons: ["erased"], exampleName: null });
  });
});

describe("locking an organization's sheet connections", () => {
  it("takes them in id order, so two erasures and a check never wait on each other in a circle (M9)", async () => {
    const statements: string[] = [];
    const recorder = {
      $queryRaw: (strings: TemplateStringsArray) => {
        statements.push(strings.join("?"));
        return Promise.resolve([]);
      },
    } as unknown as OrgTx;
    await lockSheetConnections(recorder, "00000000-0000-7000-8000-000000000000");
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/ORDER BY id\s+FOR NO KEY UPDATE/);
  });
});
