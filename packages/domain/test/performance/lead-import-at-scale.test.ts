// A 10,000-row lead import stays within its budgets (spec 11, ADR 0028): into the large agency (50,000 leads and
// their people, a neighbouring agency's beside it), a .xlsx of 10,000 rows, a third of them people the agency already
// has, is read within 2 s, checked within 15 s with every lookup one query on its live unique index, and added within
// 3 minutes, 50 rows to a transaction, the progress moving by 50 and no transaction longer than a batch. Everything
// runs as app_runtime inside forOrg, so the plans are the runtime's under row-level security.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx, type Sql } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createIsolatedDatabase, createTestOrganization, type IsolatedDatabase } from "@travel-crm/db/testing";
import { createSpreadsheets } from "@travel-crm/integrations/spreadsheets";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { addLeadImport } from "../../src/crm/lead-import/lead-add-job.js";
import { checkLeadImport } from "../../src/crm/lead-import/lead-check.js";
import {
  anyLeadOfQuery,
  blockedContactsQuery,
  destinationsNamedQuery,
  openLeadsOfQuery,
  personContactsQuery,
} from "../../src/crm/lead-import/lead-lookups.js";
import { readLeadFile } from "../../src/crm/lead-import/lead-read.js";
import { createFiles } from "../../src/files/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import {
  earlierFingerprintsQuery,
  importBatchOf,
  readImportFile,
  requestImportAdd,
  rowFingerprint,
  type ImportJobDependencies,
} from "../../src/imports/index.js";
import type { ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { crmEntitlements } from "../crm/lead-import/support/lead-imports.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { fakeIdentity } from "../imports/support/test-imports.js";
import { seedLargeAgency } from "./large-agency.js";
import { planOf, type QueryPlan } from "./query-plans.js";

const SIZE = { leads: 50_000, tasks: 0, staff: 500, destinations: 300 };
const ROWS = 10_000;
const BATCH = 50;

describe("a 10,000-row lead import into a large agency", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let importer: MemberAccess;
  let dependencies: ImportJobDependencies;
  let context: ListenerContext;
  let importId: string;
  const found = new Map<string, QueryPlan>();
  const timings = new Map<string, number>();

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const plan = async (name: string, query: Sql) => {
    const read = await inOrg((tx) => planOf(tx, query));
    found.set(name, read);
    return read;
  };
  const timed = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    const result = await run();
    timings.set(name, Math.round(performance.now() - started));
    return result;
  };

  /** The file: a third of its people are the agency's own (their phones are seeded), the rest are new. */
  async function theFile(): Promise<Uint8Array> {
    const writer = createSpreadsheets().writer({
      kind: "xlsx",
      sheetName: "Leads",
      columns: ["Name", "Phone", "Email", "Destination", "Stage", "Owner"].map((header) => ({
        header,
        kind: "text" as const,
      })),
    });
    writer.write(
      Array.from({ length: ROWS }, (_, index) => {
        const known = index % 3 === 0;
        const phone = known
          ? `+9198${String(1 + (index / 3) * 3).padStart(8, "0")}`
          : `+9197${String(index).padStart(8, "0")}`;
        return [
          known ? `Known Customer ${String(index)}` : `Bulk Customer ${String(index)}`,
          phone,
          index % 5 === 0 ? `bulk${String(index)}@example.com` : null,
          index % 50 === 0 ? `Brand New ${String(index % 7)}` : `Destination ${String(1 + (index % 300))}`,
          index % 4 === 0 ? "Called" : null,
          index % 2 === 0 ? "Asha" : "Ravi",
        ];
      }),
    );
    return writer.finish();
  }

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 3, transactionLimits: { timeout: 60_000 } });
    organizationId = await createTestOrganization(platform, "Importing agency");
    const { ownerUserIds } = await seedLargeAgency(platform, isolated.urls, organizationId, SIZE);
    // Agencies share the tables: one seeded after this one.
    const neighbour = await createTestOrganization(platform, "Neighbouring agency");
    await seedLargeAgency(platform, isolated.urls, neighbour, { ...SIZE, leads: 50_000 });
    const [asha, ravi] = [ownerUserIds[0] ?? "", ownerUserIds[1] ?? ""];
    importer = memberWithStarterRole("org-admin", { organizationId, userId: asha, memberId: randomUUID() });
    const files = createFiles({ db, storage: createMemoryStorage() });
    dependencies = {
      files,
      spreadsheets: createSpreadsheets(),
      identity: fakeIdentity({ access: importer, workers: { asha, ravi }, firstOwner: asha }),
      subscriptions: { entitlementsOf: () => Promise.resolve(crmEntitlements()) },
      seatLimit: () => Promise.resolve(null),
    };
    context = { actor: systemActor(organizationId), forOrg: (work) => db.forOrg(organizationId, work) };
    const batch = await platform.importBatch.create({
      data: {
        organizationId,
        kind: "leads",
        status: "checking",
        fileName: "enquiries-oct-2026.xlsx",
        fileKind: "xlsx",
        startedBy: importer.userId,
        keepUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    importId = batch.id;
    const stored = await files.storeGeneratedFile(importer, {
      recordType: "import_batch",
      recordId: importId,
      fileName: "enquiries-oct-2026.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: await theFile(),
    });
    await platform.importBatch.update({ where: { id: importId }, data: { fileAttachmentId: stored.id } });
    const fields = ["name", "phone", "email", "destination", "stage", "owner"];
    await platform.importColumn.createMany({
      data: fields.map((field, position) => ({
        organizationId,
        batchId: importId,
        position,
        header: ["Name", "Phone", "Email", "Destination", "Stage", "Owner"][position] ?? field,
        field,
      })),
    });
  }, 600_000);

  afterAll(async () => {
    const indexes = Object.fromEntries([...found].map(([name, read]) => [name, read.indexes]));
    console.info("Lead import at scale:", JSON.stringify({ milliseconds: Object.fromEntries(timings), indexes }));
    await db.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  const batchOf = async () => {
    const batch = await inOrg((tx) => importBatchOf(tx, importId));
    if (batch === null) throw new Error("no batch");
    return batch;
  };

  it("reads a 10,000-row file within 2 s", async () => {
    const sheet = await timed("read", async () => readImportFile(dependencies, await batchOf()));
    expect(sheet.rows).toHaveLength(ROWS);
    expect(timings.get("read")).toBeLessThan(2000);
  });

  it("checks 10,000 rows within 15 s, each lookup one query on its live unique index", async () => {
    const file = await readLeadFile(context, dependencies, await batchOf());
    const contacts = file.rows.flatMap((row) => (row.kind === "enquiry" ? [row.contacts] : []));
    const phones = contacts.flatMap((contact) => contact.phone ?? []);
    const emails = contacts.flatMap((contact) => contact.email ?? []);
    const [known] = await inOrg((tx) => tx.person.findMany({ take: 1000, select: { id: true } }));
    const personIds = (await inOrg((tx) => tx.person.findMany({ take: 1000, select: { id: true } }))).map(
      (person) => person.id,
    );
    expect(known).toBeDefined();
    const lookups: [string, Sql, string][] = [
      ["phones", personContactsQuery("phone", phones), "person_phone_live"],
      ["emails", personContactsQuery("email", emails), "person_email_live"],
      ["handles", personContactsQuery("instagram", ["asha.travels", "ravi.treks"]), "person_instagram_live"],
      ["open-leads", openLeadsOfQuery(personIds), "lead_person"],
      ["any-lead", anyLeadOfQuery(personIds), "lead_person"],
      [
        "blocked",
        blockedContactsQuery(phones.map((value) => ({ kind: "phone" as const, value }))),
        "blocked_contact_live",
      ],
      [
        "fingerprints",
        earlierFingerprintsQuery(
          "leads",
          file.rows.flatMap((row) => (row.kind === "enquiry" ? [rowFingerprint("leads", row.fingerprintValues)] : [])),
          importId,
        ),
        "import_row_fingerprint",
      ],
    ];
    for (const [name, query, index] of lookups) {
      const read = await plan(name, query);
      expect(read.indexes, `${name}: ${read.text}`).toContain(index);
      expect(read.seqScans, name).not.toContain("person");
      expect(read.seqScans, name).not.toContain("lead");
    }
    // The agency's destinations are a few hundred rows: the planner reads them whole, and that is the right plan.
    await plan("destinations", destinationsNamedQuery(["destination 1", "brand new 3"]));
    await timed("check", async () => {
      await checkLeadImport(context, dependencies, await batchOf());
    });
    expect(timings.get("check")).toBeLessThan(15_000);
    const checked = await batchOf();
    expect([checked.status, checked.rowsTotal, checked.rowsToAdd]).toEqual(["checked", ROWS, ROWS]);
  }, 120_000);

  it("adds 10,000 rows within 3 minutes, the progress moving every 50 rows, no transaction longer than one batch", async () => {
    await requestImportAdd(db, importer, "leads", importId, new Date());
    const longest = { ms: 0 };
    const timedContext: ListenerContext = {
      actor: context.actor,
      forOrg: async (work) => {
        const started = performance.now();
        try {
          return await context.forOrg(work);
        } finally {
          longest.ms = Math.max(longest.ms, performance.now() - started);
        }
      },
    };
    // The progress as a reader sees it, every 100 ms: each commit moves it by one batch.
    const seen = new Set<number>();
    const watching = setInterval(() => {
      void platform.importBatch.findUnique({ where: { id: importId }, select: { rowsDone: true } }).then((row) => {
        if (row !== null) seen.add(row.rowsDone);
      });
    }, 100);
    try {
      await timed("add", async () => {
        await addLeadImport(timedContext, dependencies, await batchOf(), randomUUID());
      });
    } finally {
      clearInterval(watching);
    }
    timings.set("longest-transaction", Math.round(longest.ms));
    expect(timings.get("add")).toBeLessThan(180_000);
    const done = await batchOf();
    expect([done.status, done.rowsAdded]).toEqual(["done", ROWS]);
    expect([...seen].every((rows) => rows % BATCH === 0)).toBe(true);
    expect(seen.size).toBeGreaterThan(5);
    // A batch is 50 rows; a transaction of the end (the report, the notices) is no longer than a few of them.
    expect(longest.ms).toBeLessThan(15_000);
  }, 400_000);
});
