// The lead import's add (bulk plan, Task 1.4; Review Focus 2, 3, 4): 50 rows to a transaction through the one save
// path, the rules applied again row by row, resumable and stoppable, the importer's access resolved afresh, the
// report, and one notice to each owner.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "@travel-crm/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { addLeadImportListener, checkLeadImportListener } from "../../../src/crm/index.js";
import { addLeadBatch } from "../../../src/crm/lead-import/lead-add.js";
import { addLeadImport } from "../../../src/crm/lead-import/lead-add-job.js";
import { readLeadFile } from "../../../src/crm/lead-import/lead-read.js";
import type { MemberAccess } from "../../../src/identity/index.js";
import {
  finishImport,
  importBatchOf,
  requestImportAdd,
  stopImport,
  type ImportJobDependencies,
} from "../../../src/imports/index.js";
import type { ListenerContext } from "../../../src/jobs/index.js";
import { systemActor } from "../../../src/kernel/index.js";
import { aRow } from "../../imports/support/batches.js";
import {
  anAgency,
  auditOf,
  createTestImports,
  fakeIdentity,
  listenerContext,
  memberOf,
  type TestImports,
} from "../../imports/support/test-imports.js";
import { aLead, aPerson, freshPhone } from "../support/records.js";
import { aLeadImport, leadJobDependencies, stepEvent, type LeadFileSeed } from "./support/lead-imports.js";

const HEADER = ["Name", "Phone", "Email", "Destination", "Stage", "Owner"];
const FIELDS: LeadFileSeed["fields"] = ["name", "phone", "email", "destination", "stage", "owner"];

describe("adding a lead import", () => {
  let test: TestImports;
  let organizationId: string;
  let importer: MemberAccess;
  const asha = randomUUID();
  const ravi = randomUUID();
  const owner = randomUUID();
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);
  const identityOf = (workers: Record<string, string> = { asha, ravi }, access: MemberAccess | null = importer) =>
    fakeIdentity({ access, workers, firstOwner: owner });
  const dependencies = (identity = identityOf()): ImportJobDependencies => leadJobDependencies(test, identity);
  // A batch of 50 rows is one transaction: a machine busy with other tests may need longer than Prisma's 5 s.
  const context = (): ListenerContext => ({
    ...listenerContext(test, organizationId),
    forOrg: (work) => test.db.forOrg(organizationId, work, { timeout: 60_000 }),
  });
  // A whole batch of 50: the clock must not end it sooner on a slow machine.
  const whole = { timeBoxMs: 60_000 };
  const row = (name: string | null, phone: string | null, extra: (string | null)[] = []) => [name, phone, ...extra];

  /** An import checked and ready: Add pressed, so it is adding. */
  const adding = async (file: Omit<LeadFileSeed, "header" | "fields">, seed: LeadFileSeed["seed"] = {}) => {
    const { id } = await aLeadImport(test, importer, { header: HEADER, fields: FIELDS, ...file });
    await checkLeadImportListener(dependencies()).handle(
      stepEvent(organizationId, "import.columns-matched", id),
      context(),
    );
    if (Object.keys(seed).length > 0) {
      await inOrg((tx) => tx.importBatch.update({ where: { id }, data: { ...seed } }));
    }
    await requestImportAdd(test.db, importer, "leads", id, new Date());
    return id;
  };
  const runAdd = (id: string, identity = identityOf(), listener: ListenerContext = context()) =>
    addLeadImportListener(dependencies(identity)).handle(
      stepEvent(organizationId, "import.add-requested", id),
      listener,
    );
  const batchOf = async (id: string) => {
    const batch = await inOrg((tx) => importBatchOf(tx, id));
    if (batch === null) throw new Error("no batch");
    return batch;
  };
  const rowsOf = (id: string) =>
    inOrg((tx) => tx.importRow.findMany({ where: { batchId: id }, orderBy: { rowNumber: "asc" } }));

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    importer = memberOf(organizationId);
  });

  // One import adds at a time in an agency: a test that adds by hand leaves its import adding.
  afterEach(async () => {
    await inOrg((tx) => tx.importBatch.updateMany({ where: { status: "adding" }, data: { status: "stopped" } }));
  });

  afterAll(async () => {
    await test.close();
  });

  it(
    "adds rows 50 to a transaction through the one save path, writing each row's outcome, lead and person",
    { timeout: 60_000 },
    async () => {
      const id = await adding({
        rows: Array.from({ length: 120 }, (_, index) =>
          row(`Customer ${String(index)}`, freshPhone(), [
            null,
            `Place ${String(index % 3)}`,
            null,
            index % 2 === 0 ? "Asha" : "Ravi",
          ]),
        ),
      });
      const { batch, file } = await readFor(id);
      const results: unknown[] = [];
      for (let step = 0; step < 30; step += 1) {
        const result = await addLeadBatch(context(), dependencies(), batch, file);
        results.push(result);
        if (result !== "more") break;
      }
      // Batches of 50, 50 and 20; a slow machine's clock may end one early, and then there are more of them.
      expect(results.at(-1)).toBe("done");
      expect(results.length).toBeGreaterThanOrEqual(3);
      const rows = await rowsOf(id);
      expect(
        rows.every((stored) => stored.outcome === "added" && stored.leadId !== null && stored.personId !== null),
      ).toBe(true);
      expect(rows.every((stored) => stored.fingerprint !== null)).toBe(true);
      const after = await batchOf(id);
      expect([after.rowsDone, after.rowsAdded]).toEqual([120, 120]);
      const owners = await inOrg((tx) =>
        tx.lead.groupBy({
          by: ["ownerUserId"],
          where: { id: { in: rows.map((stored) => stored.leadId ?? "") } },
          _count: true,
        }),
      );
      expect(owners.map((group) => [group.ownerUserId, group._count]).sort()).toEqual(
        [
          [asha, 60],
          [ravi, 60],
        ].sort(),
      );
      const lead = rows[0]?.leadId ?? "";
      expect((await inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: lead } }))).sourceDetail).toBe(
        "enquiries-oct-2026.csv",
      );
    },
  );

  async function readFor(id: string) {
    const batch = await batchOf(id);
    return { batch, file: await readLeadFile(context(), dependencies(), batch) };
  }

  it("leaves blocked and already imported rows out unless ticked, and adds them when ticked", async () => {
    const blockedPhone = freshPhone();
    const importedPhone = freshPhone();
    await inOrg((tx) => tx.blockedContact.create({ data: { kind: "phone", value: blockedPhone } }));
    const file = {
      rows: [row("Blocked", blockedPhone), row("Imported Before", importedPhone), row("Fresh", freshPhone())],
    };
    const { id: probe } = await aLeadImport(test, importer, {
      header: HEADER,
      fields: FIELDS,
      ...file,
      seed: { status: "matching" },
    });
    const read = await readLeadFile(context(), dependencies(), await batchOf(probe));
    const imported = read.rows[1];
    if (imported?.kind !== "enquiry") throw new Error("not read");
    const { rowFingerprint } = await import("../../../src/imports/index.js");
    await inOrg(async (tx) => {
      const earlier = await tx.importBatch.create({
        data: {
          kind: "leads",
          status: "done",
          fileName: "earlier.csv",
          fileKind: "csv",
          startedBy: importer.userId,
          keepUntil: new Date(Date.now() + 1e9),
        },
        select: { id: true },
      });
      await aRow(tx, {
        batchId: earlier.id,
        rowNumber: 2,
        outcome: "added",
        fingerprint: Uint8Array.from(rowFingerprint("leads", imported.fingerprintValues)),
      });
    });
    const unticked = await adding(file);
    await runAdd(unticked);
    expect((await rowsOf(unticked)).map((stored) => [stored.plan, stored.outcome])).toEqual([
      ["blocked", "left_out"],
      ["already_imported", "left_out"],
      ["new", "added"],
    ]);
    const ticked = await adding(
      { rows: file.rows.map((cells, index) => (index === 2 ? row("Fresh Two", freshPhone()) : cells)) },
      {
        addBlocked: true,
        addAlreadyImported: true,
      },
    );
    await runAdd(ticked);
    expect((await rowsOf(ticked)).map((stored) => stored.outcome)).toEqual(["added", "added", "added"]);
  });

  it("applies the rules again: a contact blocked since the check is left out, a lead added by hand meanwhile takes a repeat enquiry", async () => {
    const blockedLater = freshPhone();
    const addedByHand = freshPhone();
    const id = await adding({ rows: [row("Blocked Later", blockedLater), row("By Hand", addedByHand, [null, "Goa"])] });
    const leadByHand = await inOrg(async (tx) => {
      await tx.blockedContact.create({ data: { kind: "phone", value: blockedLater } });
      const person = await aPerson(tx, { name: "By Hand Already", phoneE164: addedByHand });
      return aLead(tx, { personId: person.id, ownerUserId: asha });
    });
    await runAdd(id);
    const rows = await rowsOf(id);
    expect(rows.map((stored) => [stored.plan, stored.outcome, stored.reasons[0] ?? null])).toEqual([
      ["new", "left_out", "blocked"],
      ["new", "merged", null],
    ]);
    expect(rows[1]?.leadId).toBe(leadByHand.id);
    expect(await inOrg((tx) => tx.leadEnquiry.count({ where: { leadId: leadByHand.id } }))).toBe(1);
  });

  it("gives an owner removed since the check's rows to the default owner", async () => {
    const id = await adding({
      rows: [
        row("Asha's", freshPhone(), [null, null, null, "Asha"]),
        row("Ravi's", freshPhone(), [null, null, null, "Ravi"]),
      ],
    });
    await runAdd(id, identityOf({ ravi }));
    const rows = await rowsOf(id);
    const owners = await inOrg(async (tx) =>
      (await tx.lead.findMany({ where: { id: { in: rows.map((stored) => stored.leadId ?? "") } } })).map((lead) => [
        lead.id,
        lead.ownerUserId,
      ]),
    );
    const ownerOf = (leadId: string | null) => owners.find(([found]) => found === leadId)?.[1];
    expect([ownerOf(rows[0]?.leadId ?? null), ownerOf(rows[1]?.leadId ?? null)]).toEqual([owner, ravi]);
  });

  it("fills a contact the person lacks and drops one another person holds, still adding the row", async () => {
    const phone = freshPhone();
    const heldEmail = `held-${randomUUID().slice(0, 8)}@example.com`;
    const newEmail = `new-${randomUUID().slice(0, 8)}@example.com`;
    const lacking = freshPhone();
    const person = await inOrg(async (tx) => {
      await aPerson(tx, { name: "Email Holder", phoneE164: freshPhone(), email: heldEmail });
      const first = await aPerson(tx, { name: "Phone Only", phoneE164: phone });
      const second = await aPerson(tx, { name: "Lacks Email", phoneE164: lacking });
      return { first, second };
    });
    const id = await adding({ rows: [row("Phone Only", phone, [heldEmail]), row("Lacks Email", lacking, [newEmail])] });
    await runAdd(id);
    const rows = await rowsOf(id);
    expect(rows.map((stored) => stored.outcome)).toEqual(["added", "added"]);
    expect(rows.map((stored) => stored.personId)).toEqual([person.first.id, person.second.id]);
    const people = await inOrg((tx) =>
      tx.person.findMany({ where: { id: { in: [person.first.id, person.second.id] } }, orderBy: { id: "asc" } }),
    );
    expect(people.map((found) => found.email)).toEqual([null, newEmail]);
  });

  it("never saves a row with an outcome again: a run after a crash carries on, and two overlapping runs add each row once", async () => {
    const id = await adding({
      rows: Array.from({ length: 130 }, (_, index) => row(`Overlap ${String(index)}`, freshPhone())),
    });
    const { batch, file } = await readFor(id);
    // A first run got through one batch, then died.
    expect(await addLeadBatch(context(), dependencies(), batch, file)).toBe("more");
    await Promise.all([runAdd(id), runAdd(id)]);
    const rows = await rowsOf(id);
    expect(rows.filter((stored) => stored.outcome === "added")).toHaveLength(130);
    expect(new Set(rows.map((stored) => stored.leadId)).size).toBe(130);
    expect((await batchOf(id)).status).toBe("done");
    expect(
      await inOrg((tx) => tx.lead.count({ where: { id: { in: rows.map((stored) => stored.leadId ?? "") } } })),
    ).toBe(130);
  });

  it("runs a batch again once when a contact was added meanwhile", async () => {
    const phone = freshPhone();
    const id = await adding({ rows: [row("Raced", phone, [null, "Goa"])] });
    const { batch, file } = await readFor(id);
    let transactions = 0;
    let raced = false;
    const racing: ListenerContext = {
      actor: systemActor(organizationId),
      forOrg: (work) => {
        transactions += 1;
        return test.db.forOrg(organizationId, (tx) => {
          const intercepted = new Proxy(tx, {
            get: (target, property, receiver) => {
              const value: unknown = Reflect.get(target, property, receiver);
              if (property !== "person" || raced) return value;
              return new Proxy(value as object, {
                get: (people, method, peopleReceiver) => {
                  const original: unknown = Reflect.get(people, method, peopleReceiver);
                  if (method !== "create" || typeof original !== "function") return original;
                  return async (...args: unknown[]) => {
                    raced = true;
                    // Someone else adds the same phone and commits before this save inserts it.
                    await test.platform.$executeRaw`
                      INSERT INTO person (id, organization_id, name, phone_e164, updated_at)
                      VALUES (gen_random_uuid(), ${organizationId}::uuid, 'Got There First', ${phone}, now())`;
                    return (original as (...inner: unknown[]) => Promise<unknown>).apply(people, args);
                  };
                },
              });
            },
          });
          return work(intercepted);
        });
      },
    };
    expect(await addLeadBatch(racing, dependencies(), batch, file)).toBe("done");
    expect(raced).toBe(true);
    expect(transactions).toBe(2);
    const [stored] = await rowsOf(id);
    expect(stored?.outcome).toBe("added");
    const person = await inOrg((tx) => tx.person.findUniqueOrThrow({ where: { id: stored?.personId ?? "" } }));
    expect(person.name).toBe("Got There First");
  });

  it("stops after the batch under way when Stop is pressed; the rest are 'Stopped before this row'", async () => {
    const id = await adding({
      rows: Array.from({ length: 120 }, (_, index) => row(`Stoppable ${String(index)}`, freshPhone())),
    });
    const { batch, file } = await readFor(id);
    expect(await addLeadBatch(context(), dependencies(), batch, file, whole)).toBe("more");
    await inOrg((tx) => stopImport(tx, importer, "leads", id));
    expect(await addLeadBatch(context(), dependencies(), batch, file, whole)).toBe("stopped");
    await finishImport(context(), dependencies(), id, {
      status: "stopped",
      sourceEventId: randomUUID(),
      notifyImporter: true,
      report: true,
    });
    const rows = await rowsOf(id);
    expect(rows.filter((stored) => stored.outcome === "added")).toHaveLength(50);
    expect(
      rows.slice(50).every((stored) => stored.outcome === "not_added" && stored.reasons[0] === "not_reached"),
    ).toBe(true);
    expect(await batchOf(id)).toMatchObject({ status: "stopped" });
  });

  it("ends stopped, with the report, when Stop was pressed before the first batch", async () => {
    const id = await adding({ rows: [row("Never Added", freshPhone())] });
    await inOrg((tx) => stopImport(tx, importer, "leads", id));
    await runAdd(id);
    const batch = await batchOf(id);
    expect([batch.status, batch.rowsAdded]).toEqual(["stopped", 0]);
    expect(batch.reportAttachmentId).not.toBeNull();
  });

  it("fails, keeping what it added, when the importer left, lost leads:create or leads:assign, or the agency can't change", async () => {
    const id = await adding({
      rows: Array.from({ length: 70 }, (_, index) => row(`Access ${String(index)}`, freshPhone())),
    });
    const { batch, file } = await readFor(id);
    expect(await addLeadBatch(context(), dependencies(), batch, file, whole)).toBe("more");
    expect(await addLeadBatch(context(), dependencies(identityOf({ asha }, null)), batch, file, whole)).toEqual({
      failed: "no_longer_a_member",
    });
    const sales = memberOf(organizationId, "sales", { userId: importer.userId });
    expect(await addLeadBatch(context(), dependencies(identityOf({ asha }, sales)), batch, file, whole)).toEqual({
      failed: "lost_permission",
    });
    const frozen = leadJobDependencies(test, identityOf(), "read_only");
    expect(await addLeadBatch(context(), frozen, batch, file, whole)).toEqual({ failed: "organization_cannot_change" });
    await runAdd(id, identityOf({ asha }, null));
    const after = await batchOf(id);
    expect([after.status, after.failureReason, after.rowsAdded]).toEqual(["failed", "no_longer_a_member", 50]);
  });

  it("records each row's own audit entries as the importer with source job, and import.finished with the counts", async () => {
    const phone = freshPhone();
    const id = await adding({ rows: [row("Audited", phone, [null, "Spiti"])] });
    await runAdd(id);
    const [stored] = await rowsOf(id);
    const entries = await auditOf(test, organizationId, stored?.leadId ?? "");
    expect(entries.map((entry) => [entry.action, entry.source, entry.actorUserId])).toEqual([
      ["lead.added", "job", importer.userId],
    ]);
    const person = await auditOf(test, organizationId, stored?.personId ?? "");
    expect(person.map((entry) => [entry.action, entry.source])).toEqual([["person.added", "job"]]);
    const finished = await auditOf(test, organizationId, id);
    expect(finished.map((entry) => entry.action)).toEqual(["import.started", "import.finished"]);
    expect(finished[1]?.after).toMatchObject({
      status: "done",
      outcomes: { added: 1, merged: 0, left_out: 0, not_added: 0 },
    });
  });

  it("tells each owner but the importer once: '3 leads from an import are now yours'", async () => {
    const started = new Date();
    const phone = freshPhone();
    const open = await inOrg(async (tx) => {
      const person = await aPerson(tx, { phoneE164: phone });
      await aLead(tx, { personId: person.id, ownerUserId: ravi });
      return phone;
    });
    const rows = [
      ...Array.from({ length: 3 }, (_, index) =>
        row(`Asha ${String(index)}`, freshPhone(), [null, null, null, "Asha"]),
      ),
      row("Ravi Again", open, [null, "Goa", null, "Asha"]),
      row("Importer's", freshPhone(), [null, null, null, "Importer"]),
    ];
    const importerOwned = fakeIdentity({
      access: importer,
      workers: { asha, ravi, importer: importer.userId },
      firstOwner: owner,
    });
    const { id } = await aLeadImport(test, importer, { header: HEADER, fields: FIELDS, rows });
    await checkLeadImportListener(dependencies(importerOwned)).handle(
      stepEvent(organizationId, "import.columns-matched", id),
      context(),
    );
    await requestImportAdd(test.db, importer, "leads", id, new Date());
    await runAdd(id, importerOwned);
    await runAdd(id, importerOwned);
    const notices = await inOrg((tx) =>
      tx.notification.findMany({
        where: { kind: "lead.imported", createdAt: { gte: started } },
        orderBy: { title: "asc" },
      }),
    );
    expect(notices.map((notice) => [notice.recipientUserId, notice.title, notice.body, notice.link])).toEqual([
      [
        ravi,
        "1 repeat enquiry from an import is on your leads",
        "They're on your Leads list now.",
        "/leads?source=bulk_upload",
      ],
      [asha, "3 leads from an import are now yours", "They're on your Leads list now.", "/leads?source=bulk_upload"],
    ]);
  });

  it("makes the report of rows not added and tells the importer the import is done", async () => {
    const id = await adding({
      rows: [row("Reported", freshPhone()), row(null, freshPhone()), row("No Contact", null)],
    });
    await runAdd(id);
    const batch = await batchOf(id);
    expect(batch).toMatchObject({ status: "done", rowsAdded: 1 });
    expect(batch.reportAttachmentId).not.toBeNull();
    const notices = await inOrg((tx) =>
      tx.notification.findMany({ where: { kind: "import.finished", link: `/leads/import/${id}` } }),
    );
    expect(notices.map((notice) => [notice.recipientUserId, notice.title, notice.body])).toEqual([
      [importer.userId, "Your import is done", "1 new lead. 2 rows weren't added."],
    ]);
  });

  it("leaves a Google Sheet's rows for people already in the CRM out, then adds them when ticked (N6)", async () => {
    const [openPhone, closedPhone] = [freshPhone(), freshPhone()] as [string, string];
    const people = await inOrg(async (tx) => {
      const open = await aPerson(tx, { phoneE164: openPhone });
      const openLead = await aLead(tx, { personId: open.id, ownerUserId: asha });
      const closed = await aPerson(tx, { phoneE164: closedPhone });
      await aLead(tx, { personId: closed.id, stage: "won" });
      return { openLead, closed };
    });
    const origin = {
      detail: "Goa Diwali campaign · Form responses 1",
      timeZone: "Asia/Kolkata",
      monthFirstDates: false,
    };
    const sheet = { ...dependencies(), sheetOrigin: () => Promise.resolve(origin) };
    const sheetImport = async (addInCrm: boolean) => {
      const { id } = await aLeadImport(test, importer, {
        header: HEADER,
        fields: FIELDS,
        rows: [
          row("Open", openPhone, [null, "Goa"]),
          row("Closed", closedPhone, [null, "Goa"]),
          row("Fresh", freshPhone()),
        ],
        seed: { sourceSheetId: randomUUID() },
      });
      await checkLeadImportListener(sheet).handle(stepEvent(organizationId, "import.columns-matched", id), context());
      await inOrg((tx) => tx.importBatch.update({ where: { id }, data: { addInCrm } }));
      await requestImportAdd(test.db, importer, "leads", id, new Date());
      await addLeadImportListener(sheet).handle(stepEvent(organizationId, "import.add-requested", id), context());
      return id;
    };
    const left = await sheetImport(false);
    expect((await rowsOf(left)).map((stored) => [stored.plan, stored.outcome, stored.reasons[0] ?? null])).toEqual([
      ["in_crm", "left_out", "in_crm_open"],
      ["in_crm", "left_out", "in_crm_closed"],
      ["new", "added", null],
    ]);
    const added = await sheetImport(true);
    const rows = await rowsOf(added);
    expect(rows.map((stored) => [stored.plan, stored.outcome])).toEqual([
      ["in_crm", "merged"],
      ["in_crm", "added"],
      ["new", "added"],
    ]);
    expect(rows[0]?.leadId).toBe(people.openLead.id);
    const lead = await inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: rows[1]?.leadId ?? "" } }));
    expect([lead.source, lead.sourceDetail, lead.returning]).toEqual(["google_sheet", origin.detail, true]);
  });

  it("ends a batch by the clock as well as by its rows, so no transaction nears the database's limit (I1x)", async () => {
    const id = await adding({
      rows: Array.from({ length: 4 }, (_, index) => row(`Timed ${String(index)}`, freshPhone())),
    });
    const { batch, file } = await readFor(id);
    // A time box already past: each batch takes its one row and commits.
    const results = [];
    for (let step = 0; step < 4; step += 1) {
      results.push(await addLeadBatch(context(), dependencies(), batch, file, { timeBoxMs: 0 }));
    }
    expect(results).toEqual(["more", "more", "more", "done"]);
    expect((await batchOf(id)).rowsAdded).toBe(4);
  });

  it("records a row that always fails as not added and adds the rest (I2x)", async () => {
    const id = await adding({
      rows: [row("Good One", freshPhone()), row("Poison Row", freshPhone()), row("Good Two", freshPhone())],
    });
    // Saving this person fails whenever it is tried, alone or in a batch.
    const failing: ListenerContext = {
      ...context(),
      forOrg: (work, options) =>
        test.db.forOrg(
          organizationId,
          (tx) =>
            work(
              new Proxy(tx, {
                get: (target, property, receiver) => {
                  const value: unknown = Reflect.get(target, property, receiver);
                  if (property !== "person") return value;
                  return new Proxy(value as object, {
                    get: (people, method, peopleReceiver) => {
                      const original: unknown = Reflect.get(people, method, peopleReceiver);
                      if (method !== "create" || typeof original !== "function") return original;
                      return (args: { data: { name: string } }) =>
                        args.data.name === "Poison Row"
                          ? Promise.reject(new Error("This row can't be saved"))
                          : (original as (inner: unknown) => Promise<unknown>).call(people, args);
                    },
                  });
                },
              }),
            ),
          options,
        ),
    };
    await runAdd(id, identityOf(), failing);
    const rows = await rowsOf(id);
    expect(rows.map((stored) => [stored.outcome, stored.reasons[0] ?? null])).toEqual([
      ["added", null],
      ["not_added", "could_not_add"],
      ["added", null],
    ]);
    expect((await batchOf(id)).status).toBe("done");
  });

  it("hands the rest to a run of its own after its time, which picks up where it stopped (I3x)", async () => {
    const id = await adding({
      rows: Array.from({ length: 120 }, (_, index) => row(`Continued ${String(index)}`, freshPhone())),
    });
    const batch = await batchOf(id);
    const events = () => inOrg((tx) => tx.outboxEvent.count({ where: { type: "import.add-requested" } }));
    const before = await events();
    await addLeadImport(context(), dependencies(), batch, randomUUID(), { runMs: 0, batch: whole });
    // One batch added, the import still adding, and a run of its own asked for with only the import's id.
    expect(await batchOf(id)).toMatchObject({ status: "adding", rowsAdded: 50 });
    expect(await events()).toBe(before + 1);
    const queued = await inOrg((tx) =>
      tx.outboxEvent.findFirst({ where: { type: "import.add-requested" }, orderBy: { id: "desc" } }),
    );
    expect(queued?.payload).toEqual({ importId: id, kind: "leads" });
    await runAdd(id);
    expect(await batchOf(id)).toMatchObject({ status: "done", rowsAdded: 120 });
    expect(new Set((await rowsOf(id)).map((stored) => stored.leadId)).size).toBe(120);
  });
});
