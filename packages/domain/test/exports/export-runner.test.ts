// Making an export's file in the worker (spec B37, B39, B41, B42; spec 8): the requester's access afresh, the count
// first, then page by page into one file stored once under the export's id; export.made with the filter's ids and
// fixed values, never the search; the search emptied; and the requester told, as the system.
import type { OrgTx } from "@travel-crm/db";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { exportDetail, runExport, startExport } from "../../src/exports/index.js";
import {
  anAgency,
  auditOf,
  countingContext,
  createTestImports,
  eventsOf,
  listenerContext,
  memberOf,
  type TestImports,
} from "../imports/support/test-imports.js";
import { exportDependencies, requested, testSource } from "./test-exports.js";

describe("making an export's file", () => {
  let test: TestImports;
  let organizationId: string;
  let requester: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);
  const filter = { stage: "contacted", ownerUserId: "0199e7a0-0000-7000-8000-00000000a5a1", search: "Sharma" };
  const anExport = () => inOrg((tx) => startExport(tx, requester, "leads", { format: "xlsx", filter }, new Date()));
  const detailOf = (exportId: string) => inOrg((tx) => exportDetail(tx, requester, "leads", exportId));

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    requester = memberOf(organizationId, "sales");
  });

  afterAll(async () => {
    await test.close();
  });

  it("writes one line when an export ends, with its ids, kind, format, rows and time", async () => {
    const { exportId } = await anExport();
    // Uncensored: the line is exactly what the export passed, so this proves its keys, not the censor.
    const logger = createMemoryLogger({ censor: false });
    await runExport(
      requested(organizationId, exportId),
      listenerContext(test, organizationId),
      { ...exportDependencies(test, requester), logger },
      testSource(),
    );
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({
      level: "info",
      msg: "export finished",
      organizationId,
      exportId,
      kind: "leads",
      format: "xlsx",
      outcome: "ready",
      rows: 3,
    });
    expect(typeof logger.entries[0]?.durationMs).toBe("number");
    // Proven: ids, kind, format, count and time only: no filter, search text or file name.
    expect(Object.keys(logger.entries[0] ?? {}).sort()).toEqual([
      "durationMs",
      "exportId",
      "format",
      "kind",
      "level",
      "msg",
      "organizationId",
      "outcome",
      "rows",
    ]);
    expect(JSON.stringify(logger.entries)).not.toContain("Sharma");
  });

  it("counts, writes page by page and stores the file once under the export's id, even run twice", async () => {
    const { exportId } = await anExport();
    const source = testSource();
    const written = test.spreadsheets.written.length;
    const run = () =>
      runExport(
        requested(organizationId, exportId),
        listenerContext(test, organizationId),
        exportDependencies(test, requester),
        source,
      );
    await Promise.all([run(), run()]);
    await run();
    const detail = await detailOf(exportId);
    expect(detail).toMatchObject({ status: "ready", rowsTotal: 3, rowsDone: 3, failureReason: null });
    expect(new Date(detail.expiresAt ?? 0).getTime() - new Date(detail.readyAt ?? 0).getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
    const files = await inOrg((tx) =>
      tx.attachment.findMany({ where: { recordType: "data_export", recordId: exportId } }),
    );
    expect(files.map((file) => [file.id, file.status, file.contentType])).toEqual([
      [exportId, "ready", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ]);
    const made = test.spreadsheets.written.slice(written);
    expect(made[0]).toEqual({
      kind: "xlsx",
      columns: source.columns,
      rows: [
        ["Asha", 2],
        ["=Ravi", 1],
        ["Meera", null],
      ],
    });
    // Each run asks the first page, then the one after the cursor: two at once may both ask the first.
    expect([...new Set(source.pagesAsked)]).toEqual([null, "2"]);
    // The worker's progress moves a page at a time.
    const { context, counted } = countingContext(test, organizationId);
    const { exportId: another } = await anExport();
    await runExport(requested(organizationId, another), context, exportDependencies(test, requester), testSource());
    expect(counted.transactions).toBeGreaterThanOrEqual(4);
  });

  it("fails an export whose requester lost the permission or left, and one past its row limit", async () => {
    const cases: [MemberAccess | null, ReturnType<typeof testSource>, string][] = [
      [null, testSource(), "no_longer_a_member"],
      [memberOf(organizationId, "accounts", { userId: requester.userId }), testSource(), "lost_permission"],
      [requester, testSource({ maxRows: 2 }), "too_many_rows"],
    ];
    for (const [access, source, reason] of cases) {
      const { exportId } = await anExport();
      await runExport(
        requested(organizationId, exportId),
        listenerContext(test, organizationId),
        exportDependencies(test, access),
        source,
      );
      expect(await detailOf(exportId), reason).toMatchObject({
        status: "failed",
        failureReason: reason,
        file: null,
        filter: { ...filter, search: null },
      });
    }
  });

  it("records export.made with the filter's ids and searched: true, never the search, and empties the search", async () => {
    const { exportId } = await anExport();
    await runExport(
      requested(organizationId, exportId),
      listenerContext(test, organizationId),
      exportDependencies(test, requester),
      testSource(),
    );
    const audit = await auditOf(test, organizationId, exportId);
    expect(audit.map((entry) => [entry.action, entry.actorUserId, entry.source, entry.after])).toEqual([
      [
        "export.made",
        requester.userId,
        "job",
        {
          kind: "leads",
          format: "xlsx",
          rows: 3,
          filter: { stage: "contacted", ownerUserId: filter.ownerUserId, searched: true },
        },
      ],
    ]);
    expect(JSON.stringify(audit)).not.toContain("Sharma");
    expect((await detailOf(exportId)).filter).toEqual({ ...filter, search: null });
    expect(await eventsOf(test, organizationId, ["export.made"])).toContainEqual([
      "export.made",
      { exportId, kind: "leads" },
    ]);
  });

  it("tells the requester the export is ready, linking its page", async () => {
    const { exportId } = await anExport();
    await runExport(
      requested(organizationId, exportId),
      listenerContext(test, organizationId),
      exportDependencies(test, requester),
      testSource(),
    );
    const notices = await inOrg((tx) => tx.notification.findMany({ where: { link: `/leads/exports/${exportId}` } }));
    expect(notices.map((notice) => [notice.recipientUserId, notice.kind, notice.title, notice.body])).toEqual([
      [requester.userId, "export.ready", "Your leads export is ready", "3 leads, kept for 24 hours."],
    ]);
  });
});
